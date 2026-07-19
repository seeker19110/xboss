# PLAN.md — M62 (khoá cửa RLS) + M63 (chống SSRF DNS rebinding webhook)

> Phiên chính (Fable 5) xuất kế hoạch theo mẫu này, giao **nguyên văn** cho `coordinator`
> (Opus · low) thi hành — dispatch từng việc theo nhãn `route:`, theo dõi, gọi `reviewer`,
> tích hợp, báo cáo lại; phiên chính duyệt cuối. Coordinator/worker KHÔNG thấy hội thoại
> trước đó — kế hoạch dưới đây tự chứa.

## Bối cảnh

Đóng 2 hạng mục kế tiếp trong hàng đợi `docs/nang-cap/README.md`: **M62** (đóng nốt nợ kỹ
thuật "[Trung] RLS chưa thực sự có hiệu lực trên production", tiếp nối M51 GĐ0) và **M63**
(đóng nợ "[Thấp] SSRF webhook qua DNS rebinding"). Đặc tả đầy đủ, đã kín, nằm sẵn trong:

- `docs/nang-cap/M62-rls-khoa-cua.md`
- `docs/nang-cap/M63-webhook-ssrf-dns-pinning.md`

Cả 2 đặc tả đều tự đề xuất `route: spec` — mọi đánh đổi thiết kế đã chốt trong file, worker
chỉ cần thi hành chính xác theo đúng nội dung, KHÔNG tự quyết kiến trúc thêm.

Đã xác nhận trước khi lập kế hoạch: `git fetch origin`, `origin/main` khớp nhánh hiện tại
(sạch, không có thay đổi chưa commit). Migration mới nhất trên `main` hiện tại:
`0076_session_version.sql`. **Số migration cho M62 PR2 (khoá cửa RLS) PHẢI xác nhận lại
bằng `ls migrations | sort -V | tail -3` ngay trước khi commit** — không dùng số cố định
ghi sẵn trong đặc tả gốc (bài học lặp lại nhiều lần, xem `docs/nang-cap/README.md`).

M63 **không có migration** (chỉ sửa `lib/webhooks.ts` + test).

## Không xung đột file — dispatch song song bình thường

- **M62** chạm: `lib/db/index.ts` (mở rộng `withProjectScope`), `app/api/notifications/route.ts`,
  `app/api/payments/bills/route.ts`, `app/api/payments/floors/route.ts`, migration mới,
  `tests/rls.test.ts`, `tests/project-scope-invariant.test.ts`.
- **M63** chạm: `lib/webhooks.ts`, `tests/webhooks.test.ts`, `package.json` (thêm dependency
  `undici` nếu chưa có sẵn — kiểm trước khi thêm).
- Không có file chung giữa 2 việc → **2 worktree độc lập, dispatch song song**.

---

## VIỆC 1 — M62 PR1: `withProjectScope` đọc-ghi + bọc 3 route còn lại

- `route: spec`
- Nhánh: `claude/feat-m62-pr1-rls-scope-routes`
- Đặc tả đầy đủ: `docs/nang-cap/M62-rls-khoa-cua.md` mục "PR1" (mục 1–4). Thi hành **đúng
  nguyên văn** đặc tả đó, không tự đổi thiết kế. Tóm tắt các điểm chạm bắt buộc:

1. `lib/db/index.ts::withProjectScope` — thêm tham số thứ 3 `opts?: { readOnly?: boolean }`
   (mặc định `true`, tương thích ngược 100% với mọi call-site hiện có). `readOnly === false`
   → bỏ `SET TRANSACTION READ ONLY`, giữ nguyên `SELECT set_config('app.project_id', ...)`.
2. `app/api/notifications/route.ts` (GET) — bọc **toàn bộ thân hàm sau bước auth + đọc
   `projectId`** trong `withProjectScope(projectId ?? "*", fn, { readOnly: false })` — MỘT
   transaction duy nhất cho cả route (không tách từng khối — quyết định đã chốt trong đặc
   tả, đổi ngữ nghĩa lỗi sang all-or-nothing, chấp nhận được vì sync là on-fetch idempotent).
3. `app/api/payments/bills/route.ts` + `app/api/payments/floors/route.ts` (GET) — bọc
   `withProjectScope("*")` (đọc thuần, giữ mặc định `readOnly: true`) — `'*'` là khai báo
   tường minh "cố ý đọc xuyên dự án", KHÔNG đổi thành `withProjectScope(projectId)`.
4. Test: mở rộng `tests/rls.test.ts` (ca transaction đọc-ghi qua `withProjectScope(projA, fn,
   {readOnly:false})`, đọc bảng phạm vi chỉ thấy dự án A + `INSERT` bảng không-RLS thành
   công trong cùng transaction; `readOnly` mặc định vẫn chặn ghi). Gỡ `payments/bills`,
   `payments/floors`, `notifications` khỏi whitelist "chưa bọc" trong
   `tests/project-scope-invariant.test.ts`.

### Tiêu chí chấp nhận VIỆC 1

- [ ] 3 route đều chạy trong `withProjectScope`; `tests/project-scope-invariant.test.ts`
      whitelist rỗng.
- [ ] Response 3 route không đổi shape/nội dung với cùng dữ liệu.
- [ ] `npm run lint`/`typecheck`/`test`/`build` xanh; test tích hợp RLS chạy thật qua
      `TEST_DATABASE_URL` (nếu có sẵn trong môi trường CI/local) + role NOBYPASSRLS.
- [ ] Cập nhật `PROGRESS.md` mục "Đã làm".

---

## VIỆC 2 — M62 PR2: migration "khoá cửa" RLS

- `route: spec`
- Nhánh: `claude/feat-m62-pr2-rls-khoa-cua`
- **Phụ thuộc cứng vào VIỆC 1 đã merge vào `main`** — dispatch/base worktree SAU khi VIỆC 1
  merge (đặc tả PR2 đọc `app.project_id` GUC do PR1 thiết lập nhất quán ở mọi route).
- Đặc tả đầy đủ: `docs/nang-cap/M62-rls-khoa-cua.md` mục "PR2".

### ⚠ Điều kiện tiên quyết vận hành — GHI RÕ TRONG PR, KHÔNG TỰ BỎ QUA

Đặc tả gốc yêu cầu 2 điều kiện trước khi áp migration production:

1. `[Người dùng]` đã đổi `DATABASE_URL` production sang role `xboss_app` (NOBYPASSRLS).
2. PR1 đã chạy trên production ≥ ~1 tuần, log warn "query nhóm 11 bảng thiếu GUC" không
   còn xuất hiện.

**Coordinator/worker KHÔNG xác minh được 2 điều kiện này từ trong worktree (thuộc vận hành
production, không phải trạng thái code).** Xử lý: vẫn code + test migration đầy đủ theo
đặc tả (idempotent, chạy được trên `TEST_DATABASE_URL`), nhưng ghi rõ trong mô tả PR2 và
`PROGRESS.md`: **"Migration đã sẵn sàng, CHỜ xác nhận 2 điều kiện tiên quyết vận hành ở trên
trước khi áp lên production"** — không tự coi là "xong hẳn" cho tới khi phiên chính/người
dùng xác nhận đã đủ điều kiện.

### Nội dung (theo đúng đặc tả)

- `migrations/00NN_rls_lock.sql` (số `NN` xác nhận bằng `ls migrations | sort -V | tail -3`
  **ngay trước khi commit**, không dùng số cố định trong đặc tả gốc): `DROP POLICY IF EXISTS`
  + `CREATE POLICY` lại cho cả 11 bảng RLS (danh sách 11 bảng xem `docs/adr/0005-rls.md` +
  `migrations/0069_rls.sql`), policy mới chỉ còn 2 nhánh: GUC khớp `project_id` HOẶC GUC =
  `'*'`. Bỏ hẳn nhánh `''`/NULL-cho-qua. Giữ so-text (KHÔNG cast int). Idempotent,
  append-only.
- `tests/rls.test.ts`: kịch bản "thiếu ngữ cảnh" đổi kỳ vọng từ "cho qua" → "trả 0 dòng".

### Tiêu chí chấp nhận VIỆC 2

- [ ] Trên DB test role `xboss_app`: query 11 bảng KHÔNG có GUC trả 0 dòng; có GUC đúng trả
      đúng dữ liệu dự án; GUC `'*'` trả tất cả.
- [ ] `npm run lint`/`typecheck`/`test`/`build` xanh.
- [ ] PR mô tả rõ 2 điều kiện tiên quyết vận hành CHƯA xác minh (nếu chưa) — không tự nhận
      migration này đã áp production.
- [ ] `PROGRESS.md`: cập nhật trạng thái nợ kỹ thuật "[Trung] RLS chưa thực sự có hiệu lực"
      theo đúng thực tế (code xong / chờ điều kiện vận hành để áp production — KHÔNG ghi
      "đã gỡ nợ" nếu 2 điều kiện chưa xác nhận).

---

## VIỆC 3 — M63: chống SSRF DNS rebinding cho webhook (pin IP lúc gửi)

- `route: spec`
- Nhánh: `claude/feat-m63-webhook-ssrf-dns-pinning`
- Độc lập hoàn toàn với VIỆC 1/VIỆC 2 — dispatch song song ngay từ đầu.
- Đặc tả đầy đủ: `docs/nang-cap/M63-webhook-ssrf-dns-pinning.md` — thi hành **đúng nguyên
  văn** mục "Quyết định thiết kế (đã chốt — không tự đổi)" và "Điểm chạm code". Tóm tắt:

1. `lib/webhooks.ts::isPrivateIp` — mở rộng thêm các dải theo mục 3 của đặc tả:
   `100.64.0.0/10`, `192.0.0.0/24`, `198.18.0.0/15`, `224.0.0.0/4` + `240.0.0.0/4`,
   `255.255.255.255`; IPv6: `::`, `::ffff:x.x.x.x` (bóc IPv4 kiểm lại), toàn dải `fe80::/10`
   (chuẩn hoá trước khi so, không so chuỗi thô), `fc00::/7`. Dùng `net.isIP` + parse số từng
   octet.
2. Thêm `safeLookup(hostname, opts, cb)` — chữ ký tương thích `dns.lookup`, dùng
   `all: true`, mọi IP qua `isPrivateIp`, có 1 IP bẩn → `cb(error)` (fail-closed).
3. `sendOne` — tạo `Agent` từ `undici` (dependency tường minh trong `package.json`, kiểm đã
   có chưa trước khi thêm mới) với `connect: { lookup: safeLookup }` **1 lần module-level**
   (tái dùng pool, không tạo mỗi lần gửi), truyền `dispatcher` vào `fetch`.
4. Lỗi resolve/IP-private tính là 1 lần thử thất bại bình thường — đi qua đúng nhánh
   backoff/`MAX_ATTEMPTS` hiện có, `last_error` ghi rõ tiếng Việt (vd "DNS trỏ về địa chỉ
   nội bộ: 127.0.0.1"). KHÔNG fail-hard cả batch, KHÔNG tự disable webhook.
5. `validateWebhookUrl` (lúc tạo/sửa webhook) **giữ nguyên hành vi** — chỉ `sendOne` áp
   `safeLookup`.
6. KHÔNG thêm allowlist domain (YAGNI theo đặc tả).

### Test (`tests/webhooks.test.ts` — mở rộng nếu đã tồn tại)

- Unit: bảng ca `isPrivateIp` đủ các dải mới (mỗi dải 1 IP trong + 1 IP ngoài biên),
  IPv4-mapped, `fe80::1`, domain thường → false. `safeLookup` mock `dns.lookup`: toàn IP
  public → OK; lẫn 1 IP private → lỗi; resolve lỗi → propagate.
- Tích hợp (không cần internet): HTTP server cục bộ `127.0.0.1:<port>`, mock DNS resolve về
  127.0.0.1 → `sendOne` thất bại đúng cách (`last_error` chứa "nội bộ", backoff đúng); ca đối
  chứng IP public → không bị chặn oan.

### Tiêu chí chấp nhận VIỆC 3

- [ ] Webhook bị rebind về IP nội bộ (mock DNS) KHÔNG tạo được connection — ghi `last_error`,
      retry theo backoff như lỗi mạng thường.
- [ ] Webhook bình thường (IP public) gửi thành công y hệt trước — không regression
      HMAC/headers/timeout/`redirect: "manual"`.
- [ ] `isPrivateIp` phủ đủ dải, có test biên từng dải.
- [ ] `npm run lint`/`typecheck`/`test`/`build` xanh; không thêm biến môi trường mới.
- [ ] `reviewer` bắt buộc soát diff (hạ tầng gửi dữ liệu ra ngoài — đúng lưu ý cuối đặc tả
      gốc).
- [ ] Cập nhật `PROGRESS.md`.

---

## Điều phối

- 3 việc, dispatch theo 2 lô:
  - **Lô 1 (song song ngay từ đầu, 2 worktree độc lập)**: VIỆC 1 (M62 PR1) và VIỆC 3 (M63).
  - **Lô 2 (sau khi VIỆC 1 merge vào `main`)**: VIỆC 2 (M62 PR2) — base worktree trên `main`
    mới nhất sau merge VIỆC 1.
- Trước khi commit migration ở VIỆC 2: chạy `ls migrations | sort -V | tail -3` lấy số thật,
  không tin số ghi trong đặc tả gốc hay kế hoạch này.
- `reviewer` soát diff cả 3 việc trước khi merge; **VIỆC 3 bắt buộc reviewer xác nhận đạt**
  (hạ tầng gửi dữ liệu ra ngoài, đúng lưu ý cuối `M63-webhook-ssrf-dns-pinning.md`).
- VIỆC 2 chỉ coi là hoàn tất về mặt CODE — KHÔNG tự động nghĩa là đã áp migration production;
  ghi rõ 2 điều kiện tiên quyết vận hành còn treo trong báo cáo cuối, để phiên chính/người
  dùng quyết định thời điểm áp production.
- Sau khi cả 3 việc merge: cập nhật `docs/nang-cap/README.md` — đổi trạng thái M62 (PR1 xong,
  PR2 chờ điều kiện vận hành) và M63 (xong) trong bảng "Đặc tả chờ triển khai"; cập nhật
  `PROGRESS.md` mục "Đã làm" + gỡ/điều chỉnh 2 nợ kỹ thuật tương ứng theo đúng thực tế (không
  gỡ nợ RLS nếu PR2 chưa áp production).
- Báo cáo tổng hợp về phiên chính: kết quả từng việc, số PR, kết quả reviewer, và đặc biệt
  làm rõ trạng thái treo của VIỆC 2 (chờ điều kiện vận hành) để phiên chính không nhầm là đã
  xong hoàn toàn.
