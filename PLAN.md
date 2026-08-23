# PLAN.md — Hoàn thành XBoss v1.0, rồi mở Engineering OS theo gate

**Cập nhật:** 2026-08-15
**Nguồn trạng thái:** `PROGRESS.md` và các commit `cdecf55`, `a6f98da`, `f14ea21`, `1186efb`.

**Đặc tả tổng:** `docs/nang-cap/PROJECT-COMPLETION-ROADMAP.md` — C0→C6 để đạt Product Complete v1.0; O1→O5 là lộ trình Engineering OS có điều kiện.

Mỗi phase đã có file đặc tả thi hành riêng trong `docs/nang-cap/` (index tại mục 3 của roadmap tổng); worker không thi hành từ đoạn tóm tắt trong `PLAN.md`.

## Trạng thái kế hoạch trước đó

M64 — Upload kế hoạch & tracking theo hệ đã hoàn tất ngày 2026-08-09 (migration `0082`, API/UI/test và CI). Không còn là công việc đang thực hiện; không lập lại triển khai M64 trừ khi có lỗi hoặc yêu cầu nghiệp vụ mới được xác nhận.

## Mục tiêu giai đoạn

Đưa nền tảng Engineering OS ENG-1→ENG-4 vừa hoàn tất từ trạng thái **đã có code** sang **đã được xác minh có kiểm soát trong vận hành**. Không triển khai Digital Twin, Predictive OS hoặc autonomy trước các cổng bên dưới.

**Đặc tả dẫn đường:** `docs/nang-cap/ENG-5-integration-contract-pilot.md` chốt hợp đồng ingest, idempotency, cách ly dự án, observability và pilot trước khi kết nối traffic thật.

## Việc 1 — Xác minh phát hành ENG-1→ENG-4 (`route: verification`)

- **Phạm vi:** staging trước production cho migrations `0084_engineering_core.sql` đến `0087_engineering_agents.sql`; chạy đầy đủ integration test với `TEST_DATABASE_URL`, E2E, build và kiểm tra rollback/backup theo quy trình deploy.
- **Tiêu chí đạt:** migration append-only chạy sạch trên bản sao dữ liệu; không lỗi RLS/quyền/API key; các luồng ingest → suggestion → workflow → agent session hoạt động đúng phân quyền; không có thay đổi tự động vào task/BOQ/thanh toán.
- **Điểm dừng:** bất kỳ lỗi migration, cách ly dự án/tổ chức, hoặc Gate/SoD sai phải được sửa và kiểm thử lại trước production.

## Việc 2 — Pilot tích hợp MEPF-Agents (`route: integration`)

- **Repository đối tác:** [seeker19110/MEPF-Agents](https://github.com/seeker19110/MEPF-Agents) — hệ Multi-Agent tư vấn MEPF (HVAC, điện, nước, PCCC, QS, CAD/BIM và reviewer). Đây là nguồn tích hợp chính thức; chưa cần clone, vendor hoặc chia sẻ database.
- **Phạm vi:** cấp API key scope `engineering` theo từng dự án, gửi dữ liệu mẫu có `external_key` ổn định, kiểm thử ingest lặp lại, evidence/provenance, claims và conflict resolution.
- **Tiêu chí đạt:** idempotency xác nhận bằng gửi lại cùng payload; object và suggestion không lẫn dự án; người có quyền duyệt được nội dung/evidence; conflict có cách phân xử và người chốt rõ ràng.
- **Ranh giới cứng:** XBoss là bên điều phối/lưu vết. Agent không có quyền tự ghi task, BOQ, payment hoặc tự duyệt workflow.

## Việc 3 — Khắc phục dữ liệu ngày Excel cũ (`route: operations`)

- **Phạm vi:** sao lưu, chạy `scripts/backfill-import-dates.ts` ở chế độ preview trên staging; đối chiếu danh sách dòng dự kiến sửa với file Excel nguồn; chỉ khi được xác nhận mới chạy `--apply` trên production.
- **Tiêu chí đạt:** dữ liệu chỉ thay đổi khi có đúng dấu vết lệch ngày; các dòng đã người dùng sửa tay được giữ nguyên; script chạy lại không tạo thay đổi mới.
- **Điểm dừng:** có mã task trùng đa dự án/chênh nguồn không giải thích được thì dừng và chọn `--project=<id>` hoặc xử lý thủ công.

## Việc 4 — Lập kế hoạch riêng cho audit UUID (`route: specification`)

- **Phạm vi:** thiết kế migration tương thích ngược để audit các thực thể UUID `engineering_*`, bao gồm dữ liệu lịch sử, index, truy vấn UI, rollback và tải trên bảng `audit_log`.
- **Tiêu chí đạt:** đặc tả + proof-of-concept trên staging; không sửa migration cũ hay chạy trực tiếp trên production khi chưa có kế hoạch triển khai được phê duyệt.

## Việc 5 — Quality/Security/DR release gate (`route: verification`)

- **Phạm vi:** C3→C4 của đặc tả tổng — audit UUID, RLS engineering, backfill ngày, integration/E2E trên DB thật, load/security/restore drill.
- **Tiêu chí đạt:** lỗi P0/P1 bằng 0; cách ly project/org được kiểm bằng negative test; SLO và RPO/RTO đã được owner ký; restore staging thành công.

## Việc 6 — UAT, rollout và đóng v1.0 (`route: operations`)

- **Phạm vi:** C5→C6 — UAT theo 7 vai trò, đối soát Excel/MEPF fixtures, canary production, tài liệu vận hành/đào tạo/ownership và release sign-off.
- **Tiêu chí đạt:** Product Complete theo mục 10 của đặc tả tổng; chỉ sau đó mới tag `v1.0.0`.

## Việc 7 — Chuẩn hóa bản vẽ CAD 2D: vá lỗ hổng thật trong studio TS hiện tại (2026-08-23, chặng ngắn hạn trước M99)

**Bối cảnh:** `docs/adr/0006-plugin-autocad-va-pipeline-server.md` (Đã chấp nhận) đã quyết định đường
chính chuẩn hóa bản vẽ chuyển sang plugin AutoCAD .NET (`docs/nang-cap/M99-plugin-autocad-chuan-hoa.md`,
còn **Draft — chờ duyệt**, không code phần đó). Trong lúc chờ duyệt M99, đã rà lại
`app/engineering/chuan-hoa-ban-ve/page.tsx` + các component/route liên quan và phát hiện 3 lỗ hổng
thật trong studio TypeScript hiện tại (không thuộc phạm vi cần chờ duyệt — đều là bug fix/RBAC/dọn
trùng lặp trên kiến trúc đang chạy). Không worker nào được đổi phạm vi sang xây dựng bảng điều khiển
kiểu M99 — đó là việc của giai đoạn sau khi M99 được duyệt.

### Việc 7.1 — Bộ ghi DXF R12 hợp lệ + kiểm định server-side trước khi lưu (`route: complex`)

**Vấn đề đã xác minh trong code (không phải suy đoán):**

1. `exportDxf()` và `generateStandard2dDxf()` trong `lib/cad/dxf-parser.ts` (dòng ~1441, ~1686) khai
   `$ACADVER = AC1015` (R2000) nhưng cấu trúc ghi ra thực chất là R12 (không handle, không section
   `OBJECTS`) — đúng lỗi gốc mà ADR-0006 nêu ra. `docs/nang-cap/M98-dxf-r2000-va-dwg.md` §1(b) khẳng
   định "sau bản sửa 2026-08-22 đã hạ xuống R12 (AC1009)" và có file `lib/cad/dxf-writer.ts` — file
   đó **không tồn tại**, thực chất logic vẫn nằm trong `dxf-parser.ts` và header vẫn sai là `AC1015`.
2. Nhánh ghi `DIMENSION` (dòng ~1581 `lib/cad/dxf-parser.ts`) emit thẳng entity `DIMENSION` thô
   (group code 1/10/20/13/14...) — **không đúng cả 2 phương án**: không phải R2000 hợp lệ (thiếu
   block `*D<n>`, thiếu dimstyle ref nhóm 3, thiếu subclass marker) và cũng không phải phương án đã
   chốt ở M98 §1(b) ("DIMENSION hạ thành LINE + TEXT"). Đây là bug thật, không phải scope mới.
3. Không có hàm kiểm định cấu trúc DXF (`validateDxf` mà M98 nhắc tới) ở đâu trong repo.
4. `tests/dxf-real-drawing-parser.test.ts:109` đang `assert.ok(exportedDxf.includes("AC1015"))` —
   xác nhận đúng cái sai.

**Phạm vi sửa (đóng khung — không mở rộng sang R2000 thật):**

- Đổi `$ACADVER` trong cả `exportDxf()` và `generateStandard2dDxf()` (`lib/cad/dxf-parser.ts`) từ
  `AC1015` → `AC1009` (đúng R12 đang thực sự ghi ra).
- Sửa nhánh `DIMENSION`: hạ thành 1 entity `LINE` nối `coordinates.start`→`coordinates.end` (nếu có
  cả 2, dùng layer gốc của entity) **+** 1 entity `TEXT` hiển thị `decodedText || textValue` đặt tại
  trung điểm start/end (hoặc tại `coordinates.center` nếu không có start/end) — đúng theo quyết định
  đã chốt ở M98 §1(b), không tự sáng tạo cấu trúc DIMENSION mới.
- Thêm hàm mới `export function validateDxf(content: string): { valid: boolean; errors: string[] }`
  trong `lib/cad/dxf-parser.ts`: kiểm tối thiểu — có cặp `SECTION`/`ENDSEC` cân bằng, có đủ 4 section
  bắt buộc `HEADER`/`TABLES`/`BLOCKS`/`ENTITIES`, kết thúc bằng `0\r\nEOF` (hoặc `0\nEOF`), nội dung
  không rỗng. Không cần parse đầy đủ DXF thật — chỉ là lưới an toàn tối thiểu chặn ghi rác.
- Trong `app/api/engineering/cad/save-drawing/route.ts`: gọi `validateDxf(fileContent)` trước bước
  `writeFileSync` — nếu `valid === false` → trả `422` kèm `errors`, **không ghi file, không tạo
  `drawings`/`drawing_revisions`**.
- Sửa `tests/dxf-real-drawing-parser.test.ts:109` cho khớp `AC1009`; thêm test cho `validateDxf`
  (case hợp lệ, case thiếu ENTITIES, case rỗng) và test cho nhánh DIMENSION mới xuất ra LINE+TEXT
  thay vì DIMENSION thô.
- Sửa `docs/nang-cap/M98-dxf-r2000-va-dwg.md` §1(b): bỏ nhắc tới file `lib/cad/dxf-writer.ts` không
  tồn tại, ghi đúng là logic nằm trong `lib/cad/dxf-parser.ts`.

**Ranh giới quyết định được phép (route: complex):** được tự quyết cách tính điểm giữa (midpoint)
cho TEXT của DIMENSION hạ cấp, cách format thông báo lỗi tiếng Việt của `validateDxf`, và thứ tự
kiểm tra bên trong `validateDxf`. **Không được** thêm thư viện parse DXF ngoài, không được đổi
`applyStandardLayers`/format group code khác ngoài phạm vi trên, không được đụng `parseDwgBinary`
(đã đúng theo PR0/M99, không sửa).

**Tiêu chí đạt:** `npm run typecheck` + `npm test` xanh; test cũ + test mới đều pass; `save-drawing`
trả 422 khi nhận DXF rác (không có `ENTITIES`); DXF do `exportDxf` sinh ra khai đúng `AC1009`.

### Việc 7.2 — Chặn quyền ghi bản vẽ "chính thức" trái phép (`route: spec`)

**Vấn đề đã xác minh:** `app/api/engineering/cad/save-drawing/route.ts` chỉ kiểm `getCurrentUser()`
(401 khi chưa đăng nhập) — **không có bất kỳ `CAN.*` nào**. Bất kỳ vai trò nào đã đăng nhập (kể cả
`subcon`/`bch`/`viewer`) đều gọi được endpoint này với `isApproved: true` để ghi file vào vị trí
chính thức (`drawings/{systems}/{kind}/...`) và tạo `drawings`/`drawing_revisions` — trong khi
comment đầu file mô tả đây là hành động của "Kỹ Sư Trưởng phê duyệt Gate 0". Các route CAD khác
trong cùng thư mục (`normalize`, `diff`, `convert-to-dxf`) đều đã có `CAN.manageEngineeringTwin`
hoặc `CAN.viewEngineeringGraph` — route này bị bỏ sót.

**Đặc tả kín — chỉ thi hành đúng, không tự quyết:**

- Trong `app/api/engineering/cad/save-drawing/route.ts`, ngay sau khối kiểm `getCurrentUser()`, thêm:
  ```ts
  if (!CAN.manageDrawings(user.role)) {
    return NextResponse.json({ error: "Không có quyền lưu bản vẽ" }, { status: 403 });
  }
  ```
  (import `CAN` từ `@/lib/auth` cùng dòng đang import `getCurrentUser`). Lý do chọn đúng permission
  này: `CAN.manageDrawings` (`lib/auth.ts:232`, `admin|pm|engineer`) đã là permission chuẩn cho quản
  lý bản vẽ trong dự án — khớp với đặc tả M99 §12 dự kiến dùng lại chính permission này cho token
  desktop; không tạo permission mới.
- Áp dụng cho toàn bộ `POST` (cả khi `isApproved=false` lưu tạm lẫn `true` lưu chính thức) — không
  tách 2 mức quyền khác nhau, giữ đơn giản đúng theo permission sẵn có.
- Thêm test trong file test CAD liên quan (hoặc file test mới `tests/cad-save-drawing.test.ts` nếu
  chưa có test cho route này) cho case: role `subcon`/`bch`/`viewer` gọi → 403; role
  `admin`/`pm`/`engineer` → không bị chặn bởi thay đổi này (test hiện có nếu có phải vẫn pass).

**Tiêu chí đạt:** `npm run typecheck` xanh; test 403 mới pass; các test cũ liên quan `save-drawing`
(nếu có) không đổi hành vi cho vai trò admin/pm/engineer.

**Phụ thuộc:** không phụ thuộc Việc 7.1 nhưng **cùng chạm** `save-drawing/route.ts` — coordinator
dispatch Việc 7.1 và 7.2 **tuần tự trên cùng 1 nhánh/worktree** (không song song), để tránh xung đột
merge hai patch cùng file.

### Việc 7.3 — Gom quy tắc chuẩn hóa layer/font CAD về một nguồn (`route: complex`)

**Vấn đề đã xác minh — 2 bản triển khai khác hành vi thật cho cùng một việc:**

- `normalizeCadLayers()` trong `lib/cad/dxf-parser.ts` (dòng ~270): phân biệt `M-DUCT-RETN` (hồi),
  `M-DUCT-EXHT` (thải), `M-DUCT-SUPP` (cấp) theo từ khóa `RETN/HOI/RA`, `EXHAUST/THAI/EA`, mặc định
  supply — đầy đủ hơn.
- `normalizeCadLayers()` trong `lib/engineering-cad-skills.ts` (dòng ~453, dùng bởi
  `POST /api/engineering/cad/normalize`): mọi layer chứa `DUCT/GIO/SA/RA` đều gộp về `M-DUCT-SUPP`
  — **không phân biệt hồi/thải**, khác kết quả thật với bản kia trên cùng input.
- `convertTcvn3ToUnicode()` + `TCVN3_MAP` ở 2 file **giống hệt nhau** (đã diff xác nhận) — thuần
  trùng lặp, không lệch hành vi.

**Đặc tả — bản `dxf-parser.ts` là nguồn chuẩn (đầy đủ hơn, đúng nghiệp vụ MEPF hơn):**

- Xoá định nghĩa `normalizeCadLayers`, `convertTcvn3ToUnicode`, `TCVN3_MAP`, `convertVniToUnicode`
  (nếu trùng) trong `lib/engineering-cad-skills.ts`; thay bằng `import { normalizeCadLayers,
convertTcvn3ToUnicode } from "@/lib/cad/dxf-parser"` và re-export lại đúng tên cũ (`export {
normalizeCadLayers, convertTcvn3ToUnicode }`) để mọi nơi đang `import ... from
"@/lib/engineering-cad-skills"` không phải sửa gì thêm.
- Rà toàn bộ nơi gọi `normalizeCadLayers` xuất phát từ `engineering-cad-skills.ts` (đặc biệt
  `POST /api/engineering/cad/normalize`) — hành vi trả về sẽ **chính xác hơn** (phân biệt được
  hồi/thải) chứ không phải hành vi mới tuỳ tiện; nếu có test đang assert theo mapping cũ (gộp hết về
  SUPP), cập nhật test đó theo mapping đúng của bản chuẩn.
- Không đổi chữ ký hàm, không đổi route/API contract, không đổi UI.

**Ranh giới quyết định được phép (route: complex):** được tự quyết cách tổ chức re-export (named
export thẳng hay wrapper function mỏng), được cập nhật test cũ nếu chúng assert đúng hành vi cũ sai;
**không được** đổi mapping trong `dxf-parser.ts` (đó là bản giữ nguyên, không sửa logic của nó),
không được gộp thêm các hàm CAD khác ngoài 2 hàm + map nêu trên.

**Tiêu chí đạt:** `npm run lint` + `npm run typecheck` + `npm test` xanh; không còn định nghĩa
`normalizeCadLayers`/`convertTcvn3ToUnicode`/`TCVN3_MAP` trùng lặp trong repo (`grep -rn` chỉ còn 1
nơi định nghĩa mỗi cái).

### Việc 7.4 — Auto-heal Bước 1: bỏ thanh tiến độ giả (`route: standard`)

**Vấn đề đã xác minh:** `triggerAutoHealWithProgress()` trong
`app/engineering/chuan-hoa-ban-ve/page.tsx` (dòng ~811-857) chạy `setInterval` tăng % ngẫu nhiên
(`Math.floor(Math.random() * 8) + 6` mỗi 110ms) kèm 5 message cố định đổi theo ngưỡng %, rồi khi
chạm 100% mới gọi `handleAutoHealAll()` — hàm xử lý thật chạy đồng bộ, tức thời. Thanh tiến độ này
**không phản ánh xử lý thật đang diễn ra** — kỹ sư nhìn tưởng hệ thống đang tính toán nhiều bước
nhưng thực chất toàn bộ xử lý xảy ra trong 1 lần gọi hàm ở cuối.

**Yêu cầu:**

- Bỏ cơ chế `setInterval` random-percent + message theo ngưỡng % giả.
- Thay bằng: khi bấm Bước 1 / nút Auto, set `isAutoHealing = true` (giữ nguyên state này vì
  `StepTabsNav` đang dùng để hiện icon loading), gọi `handleAutoHealAll()` ngay (bọc trong
  `requestAnimationFrame` hoặc `setTimeout(fn, 0)` nếu cần để UI kịp render trạng thái loading trước
  khi block main thread), rồi set `isAutoHealing = false`, `healCompleted = true` khi xong.
- Bỏ hẳn `healProgress` (số %) và `healStatusMessage` (5 message cố định) khỏi state nếu không còn
  dùng ở đâu khác — kiểm `StepTabsNav.tsx` đang render cả 2 prop này, cập nhật UI ở đó cho phù hợp
  (vd: hiện "Đang xử lý…" tĩnh thay vì % + message, hoặc bỏ hẳn khối hiển thị % nếu không còn ý
  nghĩa). Giữ nguyên toàn bộ layout/màu sắc còn lại của `StepTabsNav`, không thiết kế lại giao diện.
- Không đổi hành vi thật của `handleAutoHealAll()` (logic dọn rác/font/layer/dim/block) — chỉ bỏ lớp
  UI giả lập tiến độ bọc ngoài nó.

**Tiêu chí đạt:** `npm run lint` + `npm run typecheck` xanh; bấm Auto-heal trên UI (kiểm bằng
browser/dev server) vẫn cho ra đúng kết quả chuẩn hóa như trước (điểm số, layer, text), không còn
thanh % chạy giả; không còn `Math.random()` trong luồng auto-heal.

### Việc 7.5 — Sửa `drawing_revisions.status = 'pending'` vi phạm CHECK constraint (`route: standard`)

**Vấn đề đã xác minh trên Postgres thật (không phải suy đoán):** `app/api/engineering/cad/save-drawing/route.ts:182`
gán `const revStatus = isApproved ? "approved" : "pending";` rồi insert vào `drawing_revisions.status`.
Constraint gốc ở `migrations/0016_drawings.sql:29-30`:
`CHECK (status IN ('submitted','commented','approved','approved_with_comments','rejected','superseded'))`
— **chưa từng được nới** ở bất kỳ migration sau nào (đã `grep` toàn bộ `migrations/*.sql`, chỉ có
`0016` định nghĩa cột này). `'pending'` không nằm trong danh sách → mọi lần lưu bản vẽ **chưa duyệt**
(`isApproved=false`, tức luồng "lưu tạm" mặc định của trang) làm INSERT vào `drawing_revisions` ném
lỗi CHECK → route trả 500, **nhưng file đã ghi ra đĩa và dòng `drawings` đã được tạo/insertId trước
đó** → dữ liệu mồ côi (có file + có `drawings` row, không có `drawing_revisions` row tương ứng).

**Đính chính:** `drawings.kind = 'design'` (giá trị dùng khi lưu Bước 2) **không phải bug** —
`migrations/0048_drawing_kind_design.sql` đã nới CHECK của `drawings.kind` gồm `'design'` từ trước.
Chỉ sửa đúng `drawing_revisions.status`, không đụng gì tới `drawings.kind`.

**Đặc tả kín — không cần migration, chỉ sửa giá trị ứng dụng:**

- Trong `app/api/engineering/cad/save-drawing/route.ts`, đổi dòng gán `revStatus`:
  ```ts
  const revStatus = isApproved ? "approved" : "submitted";
  ```
  Lý do chọn `"submitted"` thay vì thêm `'pending'` vào CHECK: `'submitted'` đã có sẵn trong enum và
  đúng nghĩa "đã nộp, chờ quyết định" cho một revision chưa được duyệt — khớp domain hiện có, không
  cần migration/staging, không có rủi ro nới CHECK ảnh hưởng chỗ khác. Đã `grep` toàn repo xác nhận
  `'pending'` cho `drawing_revisions` chỉ dùng đúng 1 chỗ này, không nơi nào khác đọc/so sánh giá trị
  `'pending'` của cột này nên đổi an toàn.
- Kiểm tra toàn bộ file có nhánh nào khác so sánh `revStatus === "pending"` hay đọc lại `status` từ
  DB rồi so `"pending"` không (hiện chưa thấy, nhưng worker phải tự grep lại trong đúng file này để
  chắc chắn không bỏ sót nhánh nào trước khi coi là xong).
- Thêm test trong `tests/engineering-cad-save-drawing.test.ts` (file đã có từ Việc 7.2): case gọi
  `POST /api/engineering/cad/save-drawing` với `isApproved: false` (mặc định) bằng vai trò hợp lệ
  (`admin`/`pm`/`engineer`) trên `TEST_DATABASE_URL` thật → phải trả **200/201** (không còn 500), và
  dòng `drawing_revisions` tạo ra có `status = 'submitted'`.

**Tiêu chí đạt:** `npm run typecheck` xanh; test mới pass trên `TEST_DATABASE_URL`; test cũ của
7.1/7.2 trong cùng file không đổi hành vi.

### Việc 7.6 — Siết `normalizeCadLayers` theo ranh giới token, sửa hồi quy layer điện/ống nước (`route: complex`)

**Vấn đề đã xác minh (kết quả chạy thật, không phải suy đoán):** hàm `normalizeCadLayers` trong
`lib/cad/dxf-parser.ts` (nguồn chuẩn duy nhất sau Việc 7.3) dùng `String.includes()` trên toàn chuỗi
layer đã upper-case, không có ranh giới từ, nên bắt nhầm chuỗi con nằm giữa từ khác nghĩa. 2 case đã
xác nhận cho ra kết quả sai:

- `"MANG_CAP_DIEN"` (máng cáp điện) → nhánh `PIPE` được kiểm tra **trước** nhánh `ELEC`, và nhánh
  `PIPE` có điều kiện `l.includes("CAP")` (ý định: "cấp nước") → khớp nhầm vì `"CAP"` cũng là chuỗi
  con của `"MANG_CAP_DIEN"` (bản thân nó là "cáp điện", không phải "nước cấp") → kết quả sai:
  `P-PIPE-DOMW`, đúng ra phải là `E-TRAY-PWRR`.
- `"ONG_THOAT_SAN"` (ống thoát sàn) → nhánh `DUCT` được kiểm tra **trước** nhánh `PIPE`, và nhánh
  `DUCT` có điều kiện `l.includes("OA")` (ý định: outside air) → khớp nhầm vì `"OA"` là chuỗi con của
  `"THOAT"` (T-H-**O-A**-T) → kết quả sai: `M-DUCT-SUPP`, đúng ra phải là `P-PIPE-SANR`.

**Đặc tả — sửa cách khớp, giữ nguyên toàn bộ danh sách từ khóa và tên layer đích đã có:**

- Thay mọi `l.includes(X)` bằng khớp có ranh giới từ thật sự — dùng regex `new RegExp("(^|[^A-Z0-9])" + X + "($|[^A-Z0-9])")` (layer CAD thường phân tách bằng `_`/`-`/khoảng trắng, không phải chữ-số liền nhau) hoặc viết 1 helper `hasToken(l: string, token: string): boolean` dùng chung cho toàn hàm — **không đổi bất kỳ token/danh sách từ khóa nào đang có**, chỉ đổi cách so khớp.
- Đổi thứ tự ưu tiên nhánh: kiểm nhánh `ELEC`/`ELV` (điện nhẹ/nặng) **trước** nhánh `PIPE`, và có thể
  cần đặt `PIPE` trước `DUCT` hoặc ngược lại tuỳ để 2 case trên ra đúng — worker tự xác định thứ tự
  đúng bằng cách chạy lại 2 case xác nhận ở trên làm tiêu chí, cộng thêm chạy lại **toàn bộ** input
  mẫu đang có trong `tests/engineering-cad-dxf-parser.test.ts` / `tests/engineering-cad-skills.test.ts`
  liên quan tới `normalizeCadLayers` để đảm bảo không có case đang đúng bị đổi thành sai.
- Thêm test case mới trực tiếp cho `normalizeCadLayers` (đặt cạnh test hiện có của hàm này) đúng 2
  case đã xác nhận sai ở trên: `"MANG_CAP_DIEN"` → phải chứa `E-TRAY-PWRR`, `"ONG_THOAT_SAN"` → phải
  chứa `P-PIPE-SANR`.

**Ranh giới quyết định được phép (route: complex):** được tự chọn cách viết helper ranh giới từ
(regex hay tách chuỗi thủ công), được tự quyết thứ tự nhánh miễn thoả cả 2 case xác nhận lẫn mọi test
cũ đang pass. **Không được** thêm/bớt/đổi bất kỳ từ khóa hay tên layer đích (`M-DUCT-*`, `P-PIPE-*`,
`E-*`, `F-SPRN-PIPE`, `ELV-CABL-TRAY`, `S-GRID-COLS`, `G-ANNO-TEXT`) nào ngoài việc sửa cách khớp và
thứ tự nhánh; không đụng `convertTcvn3ToUnicode`/`TCVN3_MAP`/phần còn lại của `dxf-parser.ts`.

**Tiêu chí đạt:** `npm run lint` + `npm run typecheck` + `npm test` xanh; 2 test case mới pass; không
có test cũ nào liên quan `normalizeCadLayers` chuyển từ pass → fail.

### Sau khi cả 6 việc xong

Cập nhật `PROGRESS.md` (mục "Đã làm") tóm tắt thêm Việc 7.5–7.6 vào đúng mục Việc 7 đã có, đính chính
rõ phát hiện `drawings.kind='design'` ở báo cáo trước là false positive (đã có migration `0048` từ
trước). Không đóng mục `M99`/`M98` trong `docs/nang-cap/README.md`.

## Cổng mở rộng sau đó

Chỉ cân nhắc Engineering OS nâng cao, Digital Twin, Predictive OS hoặc Controlled Autonomy khi đồng thời đạt:

1. ENG-1→ENG-4 có traffic thật từ MEPF-Agents và pilot qua ít nhất một chu kỳ vận hành.
2. UAT của PM/QA xác nhận Gate 0, risk profile, SoD và cơ chế `no_consensus` hoạt động phù hợp.
3. Monitoring, audit và quy trình xử lý sự cố đủ cho dữ liệu kỹ thuật thật.
4. Có owner nghiệp vụ, phạm vi side effect và cơ chế rollback được phê duyệt bằng workflow.

Sau cổng này, thi hành tuần tự O1 System of Record → O2 Digital Twin → O3 Predictive OS → O4 Controlled Autonomy → O5 closeout. A3+ cần người dùng phê duyệt riêng theo từng workflow type; không suy ra quyền từ việc O1–O3 đã hoàn thành.

## Loại khỏi giai đoạn này

- Không thêm mô hình AI/LLM tự quyết hoặc cơ chế majority vote.
- Không tự động thực thi thay đổi nghiệp vụ.
- Không mở rộng module mới chỉ vì đã có khung dữ liệu kỹ thuật.
