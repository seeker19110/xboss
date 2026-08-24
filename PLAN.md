# PLAN.md — Đợt "nâng tầm dự án" GĐ2: cổng máy thay checklist người

**Cập nhật:** 2026-08-24
**Nguồn:** `docs/audit-2026-08-24-nang-tam.md` + kết quả GĐ1 (xem `PROGRESS.md` mục đầu)
**Nhánh nền:** `claude/nang-tam-du-an-5yexhe` (GĐ1 đã tích hợp, cổng xanh với Postgres thật)

## Bối cảnh — vì sao đợt này

GĐ1 đã bịt 4 lỗ hổng Cao và trung thực hoá dữ liệu. Nhưng bài học lớn nhất của GĐ1 là:
**checklist con người không theo kịp tốc độ thêm module của dự án này.**

- Lớp lỗi "route mới quên kiểm quyền" đã lặp ≥3 đợt audit, lần này lặp thêm **14 file**.
- Lớp lỗi "tin `projectId` client gửi" lặp ở **17 route**, và chính đặc tả GĐ1 của phiên chính
  cũng viết hẹp (quên kênh query string) → reviewer phải bắt lại.
- Lớp lỗi "chữ trắng trên nền accent sáng" lặp lần ≥3 (54b3e03 → ee8fce1 → 57 file).
- Và nặng nhất: **11 file route chết ngay ở câu SQL đầu tiên** suốt nhiều tháng mà không ai biết.

GĐ2 biến các checklist đó thành **cổng máy chạy trong CI**, cộng vá nốt lỗi SQL đã phát hiện.

**Phạm vi:** W1–W6 dưới đây. **Ngoài phạm vi (đã kiểm, không phải việc):** idempotency ảnh offline —
`migrations/0075_task_photos_hash.sql` + `POST /api/tasks/:id/photos` **đã dedup theo hash nội dung
trong 24h**; phát hiện của agent audit về mục này là **sai**, gửi lại cùng ảnh không tạo bản trùng.

## Quy ước bắt buộc cho MỌI việc (worker không thấy hội thoại trước — mọi thứ cần biết ở đây)

- **Đọc trước khi sửa:** `CLAUDE.md` (Auth, ADR-0007 ranh giới `lib/`, Quy ước) và `docs/audit.md`.
- **Ranh giới kiến trúc (ADR-0007/0008):** route chỉ là ranh giới HTTP; logic nghiệp vụ ở
  `lib/<miền>/`; import nội bộ dùng alias `@/lib/<miền>/<module>`. Chạy `npm run check:lib-layers`.
- **SQL:** qua helper `lib/db`, placeholder `?`, **không nối chuỗi chèn giá trị**.
- **Tiếng Việt:** toàn bộ UI, comment, commit message. Commit conventional prefix + mô tả tiếng Việt.
- **Migration:** GĐ2 **dự kiến không cần migration nào**. Nếu việc của bạn thật sự cần, chạy
  `ls migrations | sort -V | tail -3` lấy số thật (đừng tin số trong kế hoạch) và **báo lại** —
  đừng lặng lẽ thêm.
- **Test:** file chạm DB `import "@/tests/setup"` ở **dòng đầu tiên**.
- **Postgres CÓ SẴN trong môi trường** (bài học GĐ1: nhiều worker tưởng không có rồi để 386 ca skip).
  Binary ở `/usr/lib/postgresql/16/bin/`, **không chạy được dưới root** — dựng bằng user không đặc
  quyền, ví dụ:
  ```bash
  useradd -m pgtest 2>/dev/null; PGD=/home/pgtest/pgdata_<ten-viec>
  su pgtest -c "/usr/lib/postgresql/16/bin/initdb -D $PGD -U postgres --auth=trust -E UTF8"
  su pgtest -c "/usr/lib/postgresql/16/bin/pg_ctl -D $PGD -o '-p <cong-rieng> -k /tmp' -l $PGD/log start"
  psql "postgresql://postgres@127.0.0.1:<cong-rieng>/postgres" -c "CREATE DATABASE xboss_test;"
  export TEST_DATABASE_URL="postgresql://postgres@127.0.0.1:<cong-rieng>/xboss_test"
  ```
  **Dùng cổng riêng cho mỗi việc** (W1=55501, W2=55502, ... W6=55506) vì các việc chạy song song.
  ⚠️ `TEST_DATABASE_URL` **phải là URL TCP** — dạng Unix-socket (`?host=/tmp`) làm
  `scripts/run-tests-parallel.mjs` crash ở `new URL()` (đã dính thật ở GĐ1). Tắt cluster khi xong.
- **Cổng trước khi báo xong:** `npm run lint && npm run typecheck && npm test && npm run check:lib-layers
&& npm run build` xanh, **với `TEST_DATABASE_URL` đã đặt**. Ca skip KHÔNG tính là pass.
- **Chứng minh cổng/test bắt được lỗi:** mỗi cổng CI mới phải chứng minh **báo đỏ** khi cố tình
  đưa vào một vi phạm, rồi **xanh** khi gỡ ra. Ghi kết quả vào báo cáo. Đây là yêu cầu cứng —
  GĐ1 đã có ca một test bất biến trông có vẻ đúng nhưng **mù hoàn toàn** với lỗi nó phải bắt.
- **Không mở rộng phạm vi:** không refactor ngoài vùng được giao, không nâng dependency.

---

## Việc W1 — Vá 27 lời gọi SQL sai kiểu (`route: spec`)

**Nợ kỹ thuật nghiêm trọng nhất phát hiện ở GĐ1. Các tính năng này chưa từng chạy được lần nào.**

### Vấn đề thật (đã kiểm chứng trên Postgres thật ở GĐ1)

`lib/db` khai `query(sql, ...params)` / `queryOne` / `run` nhận tham số **biến thiên**. Nhưng 11 file
route gọi kiểu `query(sql, [projectId])` — truyền một **mảng** làm tham số duy nhất. Hệ quả:
`pg.query(pgSql, [[projectId]])` → Postgres nhận `{"1"}` thay vì `1` →
`invalid input syntax for type integer: "{"1"}"` **ngay câu truy vấn đầu tiên**.

**11 file, 27 lời gọi:**

```
app/api/engineering/bim-models/route.ts                      (3)
app/api/engineering/bim-models/[id]/elements/route.ts        (1)
app/api/engineering/bim-models/[id]/link-wbs/route.ts        (2)
app/api/engineering/bim-models/[id]/simulate-4d/route.ts     (2)
app/api/engineering/iot/devices/route.ts                     (3)
app/api/engineering/iot/alerts/route.ts                      (2)
app/api/engineering/iot/telemetry/route.ts                   (3)
app/api/engineering/subcon-ai/scores/route.ts                (5)
app/api/engineering/subcon-ai/evaluate/route.ts              (1)
app/api/engineering/subcon-ai/recommend-shortlist/route.ts   (3)
app/api/engineering/cad/parse-dxf/route.ts                   (2)
```

Tự chạy lệnh sau để lấy danh sách thật, đừng tin danh sách trên là đủ:

```bash
grep -rPzo '(?s)await (query|queryOne|run)(<[^>]*>)?\(\s*`[^`]*`,\s*\[' app/api/ --include=*.ts
```

(hoặc dùng công cụ tìm kiếm multiline của bạn — **rà cả `app/api/` chứ không chỉ `engineering/`**.)

### Cách vá — đọc kỹ, có một cái bẫy

**Vá tối thiểu: bỏ dấu ngoặc vuông, truyền tham số rời** — `query(sql, a, b)` thay vì
`query(sql, [a, b])`. **GIỮ NGUYÊN placeholder `$1`/`$2` trong chuỗi SQL.**

**Vì sao KHÔNG chuyển `$n` sang `?`** (dù `?` là quy ước dự án): `toPg` (`lib/db/index.ts:114`) chỉ
thay `?` → `$n` theo thứ tự xuất hiện, nên SQL viết sẵn `$n` vẫn chạy đúng khi tham số truyền rời.
Quan trọng hơn: **có chỗ dùng lại cùng một `$1` nhiều lần** — ví dụ
`app/api/engineering/iot/devices/route.ts` INSERT 5 dòng VALUES đều tham chiếu `$1`. Chuyển sang `?`
sẽ cần **5 tham số lặp** thay vì 1, tức phải viết lại lời gọi — rủi ro sai cao mà không được gì.
Nếu bạn thấy chỗ nào bắt buộc phải đổi placeholder, **báo lại thay vì tự đổi**.

### Kiểm chứng bắt buộc

Vá xong mà không chạy thật thì không biết có đúng không — chính vì không ai chạy thử mà lỗi này
sống sót nhiều tháng. Bắt buộc:

1. Dựng Postgres theo hướng dẫn ở mục Quy ước (cổng **55501**), chạy `npm run db:migrate`.
2. Với **mỗi** trong 11 file, gọi thật hàm/route đó (hoặc tối thiểu chạy đúng câu SQL đã vá với tham
   số thật qua `lib/db`) và xác nhận **không** còn `invalid input syntax`. Ghi vào báo cáo file nào
   đã chứng minh chạy được bằng cách nào.
3. Viết `tests/db-params-invariant.test.ts` — test **thuần fs** quét toàn bộ `app/api/**` và `lib/**`
   tìm mẫu truyền mảng cho `query`/`queryOne`/`run`, danh sách vi phạm phải **rỗng**.
4. **Chứng minh test bắt được lỗi:** trả 1 file về mẫu cũ → test **ĐỎ** chỉ đích danh file đó;
   khôi phục → **XANH**. Dán kết quả vào báo cáo.

**Lưu ý:** một số route trong danh sách vừa được GĐ1 sửa (thêm `CAN.`, `chotProjectIdChoGhi`) — đọc
code hiện tại trên nhánh, đừng giả định nội dung cũ.

---

## Việc W2 — Ba cổng CI chặn lớp lỗi route tái phát (`route: standard`)

**Biến 3 checklist đã lặp nhiều đợt thành cổng máy.** Bám đúng khuôn các cổng sẵn có
(`scripts/check-lib-layers.ts`, `check-sw-exclude.ts`, `check-migration-numbers.ts`): script `tsx`
độc lập, in vi phạm bằng tiếng Việt, `process.exit(1)` khi có vi phạm.

### W2.1 — `scripts/check-route-perms.ts` → `npm run check:route-perms`

Quét mọi `app/api/**/route.ts` có `export async function POST|PATCH|PUT|DELETE`. Mỗi handler ghi
**phải** tham chiếu ít nhất một trong: `CAN.`, `canTouchTask`, `canTouchPackage`, `requireApiKey`.
Vi phạm → liệt kê file + method.

**WHITELIST bắt buộc kèm lý do từng mục** (theo tiền lệ `tests/org-scope-invariant.test.ts`): các
route auth (`app/api/auth/**` — chính là nơi cấp quyền), webhook có xác thực riêng
(`app/api/telegram/webhook`, `app/api/zalo/webhook` — đã kiểm secret/chữ ký ở GĐ1), cron
(`app/api/cron/**` — bảo vệ bằng `CRON_SECRET`). Tự rà và bổ sung mục thật sự cần, **mỗi mục một lý
do cụ thể**, không whitelist cho tiện.

### W2.2 — `scripts/check-project-scope.ts` → `npm run check:project-scope`

Nâng `tests/engineering-project-scope-invariant.test.ts` (GĐ1 viết, hiện chỉ quét
`app/api/engineering/**`) thành cổng quét **toàn bộ `app/api/**`**. Cấm mẫu `body.projectId`,
`formData.get("projectId")`, `searchParams.get("projectId")` **dùng trần** — phải là tham số của
`chotProjectIdChoGhi`.

**Quan trọng — tái dùng đúng heuristic đã được kiểm chứng:** bản đầu của test GĐ1 **mù** vì chỉ cần
một dòng `import` còn sót là nó coi file hợp lệ. Bản hiện tại cắt bỏ nguyên câu lệnh
`chotProjectIdChoGhi(...)` rồi mới soi phần còn lại. **Giữ nguyên cách đó**, đừng viết lại từ đầu.
Mở rộng ra toàn `app/api/` gần như chắc chắn lộ thêm route vi phạm ngoài `engineering/` — **liệt kê
chúng vào báo cáo**; sửa những route bạn chắc chắn và đơn giản, còn lại whitelist kèm lý do + đề
xuất việc riêng. **Không tự sửa diện rộng** ngoài tầm kiểm soát.

Sau khi cổng này chạy toàn repo, cân nhắc gộp/bỏ test cũ để không kiểm trùng hai nơi (nếu bỏ, ghi rõ
lý do trong báo cáo).

### W2.3 — `scripts/check-db-params.ts` → `npm run check:db-params`

Chặn tái phát chính lỗi W1: cấm truyền **mảng** cho `query`/`queryOne`/`run`/`insertId` của
`lib/db`. Quét `app/api/**` + `lib/**`. **Phối hợp với W1:** W1 viết
`tests/db-params-invariant.test.ts`; nếu logic quét trùng nhau thì cổng này **import lại** hàm quét
đó thay vì chép code (DRY) — hoặc nếu W1 chưa tích hợp thì viết độc lập và ghi chú để gộp sau.

### Nối vào CI

Thêm cả 3 vào job `static` của `.github/workflows/ci.yml`, đặt cạnh các bước `check:*` hiện có (dòng
~60-74), đúng định dạng bước sẵn có. **Không** đụng job khác.

### Tiêu chí chấp nhận

- 3 lệnh `npm run check:*` chạy xanh trên nhánh hiện tại.
- **Mỗi cổng chứng minh báo đỏ**: cố tình thêm 1 vi phạm (route ghi bỏ `CAN.`, route đọc
  `body.projectId` trần, lời gọi `query(sql, [x])`) → cổng đỏ **chỉ đích danh** chỗ đó; gỡ ra → xanh.
  Dán output cả 3 vào báo cáo.
- CI có đủ 3 bước mới trong job `static`.

---

## Việc W3 — Đóng băng module vượt gate bằng feature flag (`route: standard`)

**Quyết định của người dùng (2026-08-24): đóng băng, KHÔNG gỡ code — đảo ngược được.**

### Vấn đề

Đợt audit kết luận nhiều module `engineering/*` được xây **vượt cổng của chính roadmap**
(`ENG-0` nguyên tắc #10: giai đoạn `OS-<n>` chỉ được code sau khi ENG-1..4 có traffic thật từ
MEPF-Agents — hiện **chưa có request nào**), và W1 chứng minh một số trong đó **chưa từng chạy được**.
Chúng đang đứng cạnh dữ liệu production như tính năng thật.

### Cái bẫy phải xử lý trước

`isModuleEnabled` (`lib/ha-tang/feature-flags.ts:41`) trả `overrides.get(moduleKey) ?? **true**` —
**mặc định BẬT**. Nên chèn dòng DB tắt cho từng dự án là mong manh: **dự án mới tạo sẽ tự bật lại**.

**Cách đúng:** thêm cờ mặc-định-tắt ở tầng **registry code**, không phải dữ liệu.

1. `lib/nen/modules.ts` — `ModuleDef` thêm trường optional `thuNghiem?: boolean` (kèm comment giải
   thích: module chưa đạt cổng kiểm chứng, mặc định TẮT cho mọi dự án, Admin bật thủ công được).
2. `isModuleEnabled` đổi thành `overrides.get(moduleKey) ?? (def?.thuNghiem ? false : true)`.
   `getModuleFlags` sửa tương ứng. **Giữ nguyên** khả năng Admin bật/tắt per-project qua `setFlag` —
   override tường minh trong DB luôn thắng mặc định.
3. Đánh dấu `thuNghiem: true` cho các module thoả **một trong hai** tiêu chí, ghi rõ tiêu chí nào
   cho từng module trong comment:
   - **(a) Vượt cổng roadmap** — nhóm OS-phase: autonomy, twin, predictions, graph, prescriptive.
     Riêng **autonomy** bắt buộc phải có (OS-4 đòi phê duyệt riêng từng workflow A3+ từ người dùng).
   - **(b) Chưa từng chạy được** (lỗi SQL W1) hoặc là mô phỏng rõ rệt: bim-models/bim-viewer,
     iot-telemetry, subcon-ai, god-tier-studio, quantum-hub, swarm, nextgen-apex.
     Module nào bạn **không chắc** thuộc tiêu chí nào → **để nguyên (không đánh dấu)** và ghi vào báo
     cáo để phiên chính quyết. Thà bỏ sót còn hơn tắt nhầm tính năng đang dùng thật.
4. **Tuyệt đối KHÔNG đánh dấu** các module nghiệp vụ lõi đang dùng thật: tracking, dashboard,
   materials, approvals, payments, contracts, boq, hse, diary, reports, notifications, admin...
5. UI: trang/nav của module `thuNghiem` khi **được bật thủ công** nên có nhãn cảnh báo
   "⚠️ Thử nghiệm — chưa kiểm chứng trên dữ liệu thật" (tái dùng component sẵn có, theo chuẩn UI
   dark-first, không `dark:`, không hex).

### Tiêu chí chấp nhận

- Dự án **mới tạo** (không có dòng override nào) → module `thuNghiem` trả `isModuleEnabled = false`;
  module lõi trả `true`. Có test chứng minh (cần DB — dùng cổng **55503**).
- Admin `setFlag(key, projectId, true, ...)` vẫn bật được module `thuNghiem` → `true` (override thắng).
- `npm run check:sw-exclude` vẫn xanh (registry là nguồn của cổng này).
- Báo cáo liệt kê **đầy đủ** module đã đánh dấu + tiêu chí (a)/(b) cho từng cái, và danh sách module
  bạn không chắc.

---

## Việc W4 — Lưới quét axe cho các trang chưa phủ (`route: standard`)

### Vấn đề

`docs/audit.md` §5 tuyên bố spec axe là **cổng merge**, nhưng ~35 trang `app/engineering/*` cùng hub
`site`/`commercial` và vài trang khác **không có spec axe nào**. Đây đúng là nơi tập trung nhiều
nhất vi phạm màu mà GĐ1 phải sửa (57 file) — không ngẫu nhiên: chưa có trọng tài.

Viết 45 spec thủ công là không khả thi. Làm **1 spec tham số hoá** quét theo danh sách route.

### Việc phải làm

1. `e2e/authed/luoi-quet-axe.spec.ts` — mảng route (mỗi mục: đường dẫn + tên tiếng Việt), loop:
   `goto` → chờ nội dung chính render (đừng chỉ chờ `networkidle` — trang rỗng cũng "idle") →
   `AxeBuilder().withTags([...]).analyze()` → assert **không** vi phạm `serious`/`critical`.
   Bám đúng pattern spec sẵn có (`e2e/authed/my-tasks.spec.ts`, `admin.spec.ts`) — cùng cách lấy
   `storageState`, cùng bộ tag WCAG.
2. Lấy danh sách route bằng cách đối chiếu thư mục `app/**/page.tsx` với các `goto()` đã có trong
   `e2e/**`. Route động (`[id]`, `[sheet]`...) cần dữ liệu seed — nếu seed hiện có không đủ thì
   **bỏ qua route đó và ghi vào báo cáo**, đừng bịa id.
3. Chạy thật `npm run test:e2e` (hoặc lệnh e2e của dự án) cho spec mới. **Vi phạm axe tìm được thì
   ghi vào báo cáo, KHÔNG tự sửa diện rộng** — sửa a11y ở ~45 trang là việc riêng, ngoài phạm vi.
   Nếu quá nhiều trang đỏ khiến spec không thể xanh, đánh dấu các trang đó `test.fixme()` kèm lý do
   - danh sách vi phạm, để spec vẫn vào được CI và làm mốc so sánh.

### Tiêu chí chấp nhận

- Spec mới chạy được thật (không phải chỉ đúng cú pháp), phủ **cả desktop + mobile** theo cấu hình
  `playwright.config.ts` sẵn có.
- Báo cáo liệt kê: số trang phủ thêm, trang nào xanh, trang nào đỏ (kèm vi phạm cụ thể), trang nào
  bỏ qua và vì sao.

---

## Việc W5 — Ba việc cơ học độc lập (`route: mechanical`)

### W5.1 — Rule lint chặn chữ trắng trên nền accent sáng

Lớp lỗi này lặp lần ≥3 (54b3e03 → ee8fce1 → 57 file ở GĐ1). Làm script
`scripts/check-mau-accent.ts` → `npm run check:mau-accent` (khuôn giống các `check:*` khác, KHÔNG
cần viết ESLint plugin — script đơn giản hơn và đủ dùng):

- **Cấm:** `text-white` cùng `bg-{emerald|sky|amber|green|teal|cyan}-500|600` trên cùng một chuỗi class.
- **Cấm:** hover no-op — `bg-{c}-N` đi cùng `hover:bg-{c}-N` **cùng số N**. ⚠️ Loại dương tính giả:
  `bg-emerald-600/20` vs `hover:bg-emerald-600/30` khác **opacity** nên KHÔNG phải no-op.
- **KHÔNG cấm** nhóm accent PASS (`blue`/`violet`/`rose`/`red`/`indigo`) — chữ trắng trên `-600` của
  nhóm này đạt ≥4,7:1, xem bảng `docs/audit.md` §13.3. **Đừng tính lại tương phản**, bảng có sẵn.
- Thêm vào job `static` của CI.
- **Chứng minh cổng đỏ** khi thêm 1 vi phạm mỗi loại, rồi xanh khi gỡ.

### W5.2 — Loại `/api/tasks/version` khỏi cache service worker

`public/sw.js` (khoảng dòng 107-115) stale-while-revalidate phủ luôn endpoint watermark
`/api/tasks/version`. Khi SSE rớt và trang tracking rơi về poll 10s, mỗi lượt poll nhận **bản cũ từ
cache** → độ trễ đồng bộ thực tế 10–20s thay vì 10s. Thêm `/api/tasks/version` (và
`/api/engineering/queue/tasks/` nếu cùng cơ chế poll tiến độ) vào danh sách loại trừ cạnh
`/api/events`, `/api/photos/`.

**Bắt buộc:** tăng version hằng `CACHE` trong `sw.js` — không tăng thì thiết bị cũ kẹt cache cũ vĩnh
viễn. Khai `swExclude` tương ứng trong registry `lib/nen/modules.ts` nếu cần và chạy
`npm run check:sw-exclude` (cổng CI kiểm khớp hai nơi).

### W5.3 — `recommend-shortlist` còn default `?? 80`

`app/api/engineering/subcon-ai/recommend-shortlist/route.ts` đọc metrics **từ DB** nhưng còn mặc
định `?? 80` khi thiếu. Cùng lớp "số mặc định đẹp" mà GĐ1 đã bỏ ở `evaluate`. Thiếu dữ liệu →
**`null` + lý do**, không thay bằng số. Bám đúng cách `lib/hien-truong/subcon-metrics.ts` (do GĐ1
tạo) đã làm; tái dùng hàm đó nếu phù hợp thay vì viết lại.

⚠️ File này nằm trong danh sách W1 — **W5.3 chỉ đụng phần giá trị mặc định**, không đụng cách truyền
tham số SQL (đó là W1). Nếu thấy trùng dòng, ưu tiên giữ nguyên phần W1 và báo lại.

---

## Việc W6 — Retention cho log webhook + coverage ratchet thành cổng CI (`route: standard`)

### W6.1 — Retention 2 bảng log webhook

`zalo_site_message_logs` và `telegram_bot_message_logs` nhận ghi từ **nguồn công khai** (webhook) và
hiện **không có giới hạn tuổi** → phình vô hạn. Thêm 2 mục vào `RETENTION_TARGETS`
(`lib/ha-tang/retention.ts:70`) theo đúng khuôn các mục sẵn có, **kèm lý do bằng tiếng Việt** như
file đó yêu cầu. Thời hạn đề xuất **180 ngày** (log vận hành bot, không phải chứng cứ nghiệp vụ) —
nếu bạn thấy khuôn hiện tại đòi owner chốt thời hạn thì ghi rõ và để phiên chính quyết.
**Không** đụng `AUDIT_LOG_KHONG_XOA`.

### W6.2 — Coverage ratchet thành cổng CI

`npm run test:coverage` đã có; mốc gần nhất ghi trong `PROGRESS.md` (lines 87,12% / branches 84,11%
/ funcs 79,46%). Nhưng ratchet hiện dựa vào **người nhớ cập nhật tài liệu**.

- Lưu mốc vào file JSON nhỏ (đề xuất `coverage-baseline.json` ở gốc repo) — chỉ 4 số + ngày đo.
- `scripts/check-coverage.ts` → `npm run check:coverage`: chạy đo, so với mốc, **fail khi tụt quá
  ngưỡng đệm 1%** (đệm để nhiễu đo không làm đỏ oan). Vượt mốc thì in gợi ý cập nhật mốc, **không**
  tự ghi đè file (tránh commit tự động ngoài ý muốn).
- Nối vào CI ở job **`test`** (không phải `static` — cần Postgres service container).
- Đo mốc thật **trên nhánh hiện tại với Postgres thật** (cổng **55506**) và ghi số đó vào
  `coverage-baseline.json`; **đừng chép số cũ từ `PROGRESS.md`** vì GĐ1 đã thêm nhiều test.

### Tiêu chí chấp nhận

- `npm run check:coverage` xanh trên nhánh hiện tại với mốc vừa đo.
- **Chứng minh đỏ:** hạ tay mốc trong JSON lên cao hơn thực tế >1% → cổng đỏ; trả lại → xanh.
- 2 mục retention mới xuất hiện đúng trong `RETENTION_TARGETS`, có lý do tiếng Việt; test/cron
  retention sẵn có vẫn xanh.

---

## Thứ tự thi hành & phụ thuộc

- **Song song được ngay:** W1, W3, W4, W5, W6.
- **W2 sau W1** — W2.3 (`check:db-params`) muốn tái dùng hàm quét của W1; W2.2 tái dùng heuristic
  của test GĐ1 đã có sẵn trên nhánh. Nếu chạy song song thì W2 viết độc lập và ghi chú để gộp.
- **W5.3 và W1 cùng chạm** `subcon-ai/recommend-shortlist/route.ts` — ranh giới đã ghi rõ trong brief
  từng việc (W1: cách truyền tham số SQL; W5.3: giá trị mặc định).
- **Không việc nào được sửa file của việc khác.** Vướng thì dừng và báo.

## Việc reviewer

Sau khi worker báo xong, gọi `reviewer` soát diff. Ưu tiên W1 (chạm 11 route, dễ sai lệch tham số),
W2 và W5.1 (cổng CI viết sai thì **mù** — GĐ1 đã có tiền lệ test bất biến trông đúng mà mù hoàn
toàn), W3 (tắt nhầm module đang dùng thật là hồi quy nặng).

## Báo cáo về phiên chính

Việc nào xong/không xong, tiêu chí nào đạt/không đạt, **output thật của phần chứng minh cổng-báo-đỏ**,
lỗi reviewer bắt được, và mọi chỗ đặc tả sai/thiếu (dừng việc đó, không tự chế đặc tả).
