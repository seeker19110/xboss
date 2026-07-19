# M63 — Chống SSRF DNS rebinding cho webhook ra ngoài (pin IP lúc gửi)

> Đặc tả viết 2026-07-19 (đợt đánh giá chi tiết lần 8), đóng nợ kỹ thuật **[Thấp] "SSRF webhook qua
> DNS rebinding"** (phát hiện từ audit lần 7, xem `PROGRESS.md` › Nợ kỹ thuật). Toàn bộ điểm chạm
> nằm trong `lib/webhooks.ts` (M49 PR2).

## Vấn đề

`validateWebhookUrl` chỉ chặn **literal IP** nội bộ lúc tạo/sửa webhook; domain được cho qua (đúng
thiết kế gốc — DNS có thể đổi). `sendOne` đã có `redirect: "manual"` (chặn 3xx chuyển hướng về nội
bộ) nhưng **không resolve DNS trước khi `fetch`** → kẻ kiểm soát domain có thể trỏ bản ghi DNS về
`127.0.0.1`/`10.x`/metadata IP sau khi webhook được duyệt, biến cron `deliver-webhooks` thành proxy
gọi vào mạng nội bộ (kèm payload ký HMAC — không rò secret, nhưng vẫn là SSRF mù có thể dò cổng/gọi
endpoint nội bộ không auth).

Lỗ hổng con TOCTOU: nếu chỉ "resolve → kiểm → rồi fetch bằng hostname", DNS có thể đổi giữa 2 bước
(rebinding đúng nghĩa). **Phải pin IP**: fetch đi thẳng tới đúng IP đã kiểm.

## Quyết định thiết kế (đã chốt — không tự đổi)

1. **Resolve + pin qua undici dispatcher**, không tự nối socket tay: Node fetch của Next dùng undici;
   `Agent({ connect: { lookup } })` cho phép thay hàm resolve DNS của riêng connection đó. Hàm
   `lookup` tuỳ chỉnh: `dns.lookup(hostname, { all: true })` → lọc qua `isPrivateIp` mở rộng → nếu
   **bất kỳ** IP nào private → trả lỗi (fail-closed, không "chọn IP public còn lại"); nếu sạch → trả
   danh sách IP cho undici connect. TLS/SNI/Host header giữ nguyên theo hostname (URL không đổi) —
   chứng chỉ vẫn verify đúng domain.
2. **Kiểm ngay trong `lookup` của connection** (không kiểm trước rồi fetch riêng) → đóng TOCTOU: IP
   dùng để connect chính là IP vừa kiểm.
3. **Mở rộng `isPrivateIp`** (hiện thiếu vài dải): thêm `100.64.0.0/10` (CGNAT), `192.0.0.0/24`,
   `198.18.0.0/15` (benchmark), `224.0.0.0/4` + `240.0.0.0/4` (multicast/reserved),
   `255.255.255.255`; IPv6: `::` (unspecified), `::ffff:x.x.x.x` (IPv4-mapped — **bóc IPv4 ra kiểm
   lại bằng nhánh IPv4**), toàn dải `fe80::/10` (hiện chỉ so `fe80:` prefix chuỗi — chuẩn hoá trước
   khi so), `fc00::/7` (giữ). Chuẩn hoá địa chỉ trước khi so (dùng `net.isIP` + parse số từng octet,
   không so chuỗi thô).
4. **Chỉ áp cho đường gửi thật (`sendOne`)** — `validateWebhookUrl` lúc tạo/sửa giữ nguyên hành vi
   (vẫn chặn literal IP + localhost, không resolve ở bước này để không chặn nhầm domain nội bộ tạm
   thời chưa có DNS công khai lúc cấu hình).
5. **Không thêm allowlist domain** (YAGNI — chưa có nhu cầu; nếu sau này cần, mở đặc tả riêng).
6. Lỗi resolve/IP-private tính là **1 lần thử thất bại** bình thường: đi qua đúng nhánh backoff/
   `MAX_ATTEMPTS` hiện có, `last_error` ghi rõ (vd `"DNS trỏ về địa chỉ nội bộ: 127.0.0.1"`) — không
   fail-hard cả batch, không disable webhook tự động.

## Điểm chạm code

- `lib/webhooks.ts`:
  - Tách `isPrivateIp` → mở rộng theo mục 3 (giữ export nội bộ, thêm export cho test nếu cần —
    ưu tiên `export` hàm thuần để test trực tiếp thay vì test qua fetch).
  - Thêm `function safeLookup(hostname, opts, cb)` (chữ ký `dns.lookup`-compatible cho undici
    `connect.lookup`): resolve `all: true`, mọi IP qua `isPrivateIp` — có IP bẩn → `cb(new Error(...))`.
  - `sendOne`: tạo `Agent` (import `Agent` từ `undici` — thêm dependency **types** nếu cần; runtime
    dùng undici bundle sẵn của Node ≥ 20 qua `node:` hoặc dependency `undici` tường minh trong
    `package.json`, chọn dependency tường minh để không phụ thuộc internal của Node) với
    `connect: { lookup: safeLookup }`, truyền `dispatcher` vào `fetch`. Agent tạo **1 lần module-level**
    (tái dùng connection pool), không tạo mỗi lần gửi.
- Không migration, không đổi API/route, không đổi UI.

## Test (`tests/webhooks.test.ts` — mở rộng file hiện có nếu đã tồn tại, không thì tạo mới)

Unit (thuần, không mạng):

- `isPrivateIp`: bảng ca đủ các dải mới (mỗi dải 1 IP trong + 1 IP ngoài biên — off-by-one),
  IPv4-mapped `::ffff:127.0.0.1` = true, `::ffff:8.8.8.8` = false, `fe80::1` = true, `2606:4700::1`
  = false, chuỗi rác không phải IP = false (domain cho qua).
- `safeLookup`: mock `dns.lookup` — (a) toàn IP public → trả đúng danh sách; (b) lẫn 1 IP private
  trong nhiều IP public → lỗi (fail-closed); (c) resolve lỗi → propagate lỗi.

Tích hợp (chạy được cục bộ, không cần internet):

- Dựng HTTP server cục bộ trên `127.0.0.1:<port>`, tạo delivery với URL `http://localhost-alias/...`
  mà `safeLookup` sẽ resolve về 127.0.0.1 (mock dns) → `sendOne` phải **thất bại** với `last_error`
  chứa "nội bộ", `attempts` tăng, `next_retry_at` theo backoff — chứng minh chặn ở tầng connect,
  không phải validate URL.
- Ca đối chứng: mock resolve về IP public + intercept fetch (hoặc chấp nhận lỗi connect timeout) —
  xác nhận đường đi bình thường không bị `safeLookup` chặn oan.

## Tiêu chí chấp nhận

- [ ] Webhook domain bị rebind về IP nội bộ (mô phỏng bằng mock DNS) KHÔNG tạo được connection —
      lỗi ghi vào `last_error`, retry theo backoff như lỗi mạng thường.
- [ ] Webhook bình thường (IP public) gửi thành công y hệt trước — không regression HMAC/headers/
      timeout/`redirect: "manual"`.
- [ ] `isPrivateIp` phủ đủ dải theo mục 3, có test biên từng dải.
- [ ] `npm run lint`/`typecheck`/`test`/`build` xanh; không thêm biến môi trường mới.

## Định tuyến đề xuất

`route: spec` (đặc tả đã kín — mọi đánh đổi chốt ở mục Quyết định thiết kế; thi hành chính xác,
1 file lib + 1 file test). Reviewer bắt buộc soát diff vì `lib/webhooks.ts` thuộc nhóm hạ tầng gửi
dữ liệu ra ngoài.
