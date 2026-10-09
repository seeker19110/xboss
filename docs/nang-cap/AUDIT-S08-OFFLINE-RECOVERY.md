# S08 — UI phục hồi hàng đợi ngoại tuyến và browser acceptance

State: **Approved for implementation**.
Chủ dự án duyệt QUALITY-FINAL-1 (2026-09-25) và yêu cầu thi hành tiếp lộ trình ngày 2026-10-08.
Spec cha: [A2 Offline](AUDIT-2026-09-25/A2-OFFLINE.md) (A2-FR01/FR02/FR05/FR11, §5 journeys,
A2-AC01/AC06/AC08/AC09/AC10), [PLAN §S08](AUDIT-2026-09-25/PLAN.md), [APPROVAL](AUDIT-2026-09-25/APPROVAL.md)
D03/D04, [TEST-MATRIX](AUDIT-2026-09-25/TEST-MATRIX.md) A2-AC01..AC10. Nền: [S05](AUDIT-S05-OFFLINE-VAULT.md)
(context/vault server), [S06](AUDIT-S06-OFFLINE-RECEIPT.md) (receipt/precondition),
[S07](AUDIT-S07-OFFLINE-QUEUE-VAULT.md) (queue v2 mã hoá). Đây là phạm vi con, không thay contract
của đặc tả cha. Không thêm dependency, không migration server, không đổi contract server S05/S06.

## Phạm vi và contract

### 1. Màn phục hồi (`app/components/OfflineRecoveryPanel.tsx`)

- Mở từ badge AppHeader (`OfflineQueueBadge` — nay là nút, cũng là "host" của màn) và nút "Chi tiết"
  trên chip trạng thái lưới tracking (`moManPhucHoiNgoaiTuyen()`). Badge hiện khi còn op của chủ
  hiện hành **hoặc** còn dữ liệu v1 legacy.
- Dữ liệu chỉ qua API manager (vault của **chính chủ** đang đăng nhập, giải mã trong bộ nhớ):
  `danhSachThaoTac()` (trạng thái + `lastResult` mã máy + `moDuoc` + ngày nhật ký/số ô — không payload),
  `demLegacy()` (chỉ đếm), snapshot `useOfflineQueueStatus`.
- Nhóm: **Chờ gửi** (pending, chưa thử) / **Chờ gửi lại** (pending đã thử, kèm lý do + giờ thử lại) /
  **Đang gửi** / **Cần xác minh** (conflict) / **Bị từ chối** (rejected, kèm `HTTP status · code` dịch
  tiếng Việt) / **Tạm dừng — cần đăng nhập** (paused_auth) / **Bị khoá** (= tổng op của chủ − op mở
  được: khoá chưa mở/hết hạn/khác dự án) / **Dữ liệu cũ chưa rõ chủ** (legacy v1: chỉ số lượng + giải
  thích, KHÔNG hiện nội dung, KHÔNG xoá, KHÔNG gán chủ).
- Văn bản luôn phân biệt "lưu trên thiết bị" với "đã lên máy chủ" (D03).
- Hành động:
  - **Gửi lại ngay** → `guiLaiNgay()`: op `pending` đang chờ backoff về hạn gửi ngay
    (`QueueDb.datLaiHanGui`), **giữ** hạn của op vừa nhận 429/503 (Retry-After là yêu cầu máy chủ, D04),
    rồi flush.
  - **Mở khoá** (vault khoá + có mạng) → `moKhoa()` = xác minh online đầy đủ của S07 (auth/me → context →
    unlock → auth/me). Tab đã nhận tín hiệu đổi ngữ cảnh thì không mở (phải tải lại trang).
  - **Bỏ thao tác này** — chỉ op `conflict`/`rejected`, xác nhận qua `appConfirm` (danger) rồi
    `boThaoTac(operationId)`: đọc op của **chủ hiện hành** ở **dự án hiện hành**, đúng trạng thái
    conflict/rejected mới gọi `store.xoaTheoYeuCau(owner, [id])` (store vẫn kiểm owner). Không xoá hàng
    loạt, không xoá op chờ/đang gửi/paused_auth, không đụng legacy hay op chủ khác.
- A11y: `Modal` của `dialogs` (role=dialog, aria-modal, tên = tiêu đề h2, Tab-trap, Esc đóng và trả focus
  về nút đã mở); focus vào tiêu đề (`tabIndex=-1`) khi mở và khi chuyển màn xung đột; vùng
  `role="status" aria-live="polite"` báo tóm tắt + kết quả hành động; nút ≥40px (`Button`), Chip theo token,
  emerald = hành động chính, amber chỉ cảnh báo; không `dark:`, không hex.

### 2. Xung đột nhật ký (A2-FR11)

- Op `diary_note` ở `conflict` có nút **Xem & giải quyết**: `xemNhatKyXungDot(id)` đọc bản thiết bị (giải
  mã trong bộ nhớ) + cờ `coBanMoiHon`; UI `GET /api/diaries/:date` (server kiểm quyền; 403 → báo không còn
  quyền, không so sánh) lấy bản máy chủ + `etag`. Hiển thị hai cột cùng trường (thời tiết, công việc,
  vướng mắc, an toàn, nhân lực, số ảnh).
- **Giữ bản trên thiết bị** (xác nhận) → `giuBanNhatKyThietBi(id, etagMayChu)`: `themOp` op **mới**
  (operationId mới) cùng payload, `baseVersion = etag máy chủ vừa xem` (null → `If-None-Match: *`); **chỉ
  sau khi op mới commit** mới `xoaTheoYeuCau` op cũ. Op mới lưu thất bại → op cũ giữ nguyên; bỏ op cũ thất
  bại → op cũ (conflict) vẫn chặn FIFO trước op mới, không mất gì. Không tự gộp trường, không dùng giờ máy
  làm phiên bản; máy chủ đổi tiếp → op mới lại 412 → conflict.
- Từ chối "giữ" khi: có bản nháp **mới hơn** cùng ngày trên thiết bị (bản mới hơn thắng — chỉ còn lựa
  chọn bỏ op cũ), nhật ký máy chủ đã khoá sổ, không tải được bản máy chủ.
- **Dùng bản máy chủ** (xác nhận danger) → `boThaoTac(id)`.

### 3. Đăng xuất / đổi người dùng (A2-AC01, D03)

- `khoaPhien(quenChu)` (manager): khoá vault, xoá cache giải mã + bản đồ ô/khoá đã chuẩn bị trong bộ nhớ,
  dừng gửi, báo SW bỏ ngữ cảnh; **giữ** ciphertext. `quenChu=true` (đăng xuất/đổi tài khoản) còn quên
  "chủ cuối" để badge không đếm op của người trước; `switch` (đổi dự án, cùng người) vẫn đếm `locked`.
- Trang tài khoản gọi `khoaNgoaiTuyenKhiDangXuat()` ngay sau `POST /api/auth/logout` thành công, rồi
  `phatDoiNguCanh("logout")` + `redirectToLogin("logout")`. Tab khác nhận epoch `logout`/`actor` →
  `khoaPhien(true)`; `switch` → `khoaPhien(false)`.
- Lớp khoá khi tự đăng xuất: "Đã đăng xuất trên thiết bị này" — nói rõ thao tác chưa gửi vẫn giữ (mã
  hoá) trên thiết bị cho chính chủ đăng nhập lại; không nói như máy chủ đã thu hồi/hết hạn phiên.

### 4. Service worker — allowlist tường minh (A2-FR01/FR02, A2-AC09)

Hiện trạng trước S08 (sau S04): mọi `/api` network-only. S08 thêm **allowlist tường minh** network-first
cho đúng 2 GET đọc lưới tracking; mọi API khác giữ network-only. `CACHE` → `xboss-public-v21`, cache API
riêng `xboss-api-v21` (namespace sở hữu `xboss-(public-|api-)?v<n>` ở cả SW và `serviceWorkerCache.ts`).

| Allowlist                              | Query khớp tuyệt đối                                   | Lý do                                                              |
| -------------------------------------- | ------------------------------------------------------ | ------------------------------------------------------------------ |
| `GET /api/tasks`                       | đúng 1 khoá `sheet` = slug `^[a-z0-9][a-z0-9-]{0,49}$` | dữ liệu lưới khi trang tải lại dữ liệu (`useTrackingData.load`)    |
| `GET /api/workpackages/:id/dimensions` | không query                                            | bung nhóm khi mất mạng (`TrackingGrid.load`) — cần để tick offline |

Không đưa vào: `/api/diaries/:date` (server trả `private, no-store`; modal nhật ký lưu offline với etag
null → `If-None-Match: *`, xung đột xử lý ở mục 2), users/thông báo/sheet/version/SSE.

- **Luôn network-only** (kiểm TRƯỚC allowlist, kể cả khi allowlist bị nới): `/api/auth/*`, `/api/offline/*`,
  `/api/events`, và mọi đường có **đoạn** thuộc miền tài chính/mua sắm/hợp đồng (contracts, contract-documents,
  payment-certs, payments, payroll, costs, finance, invoices, cash-transactions, advances, purchase-orders,
  purchase-requests, procurement, po, claims, claim-documents, variations, vo, vo-documents, proposals,
  tenders, suppliers, insurance-bonds, ipc, bills, budgets, boq, boq-norms, export). Request có
  `Authorization` cũng network-only.
- **Network-first**: có phản hồi mạng là trả **nguyên** (401/403/404/409/5xx không bao giờ thành stale 200);
  phản hồi không lưu được/không phải 200 → xoá bản cũ của URL đó. Chỉ khi `fetch` ném lỗi mạng mới đọc cache.
- **Ngữ cảnh theo tab**: trang báo `{type:"OFFLINE_CONTEXT", tag, expiresAt}` khi vault ACTIVE (tag = UUID
  ngẫu nhiên mỗi phiên vault, `expiresAt` = hạn lease theo đồng hồ tường), `tag:null` khi khoá; báo lại khi
  `controllerchange` và mỗi 20 s lúc vault mở (SW rảnh bị dừng sẽ mất ngữ cảnh trong bộ nhớ → fail-closed
  cho tới lần báo kế). Không PII/khoá/contextId. SW kiểm hình dạng, hạn ≤ now + 8 h 1 phút.
- **Ghi** chỉ khi tab có ngữ cảnh, response 200 same-URL không redirect, `application/json`, không
  `no-store`; metadata `{v, tag, generation, resourceKey, query, fetchedAt, expiresAt}` trong header nội bộ
  (gỡ trước khi trả trang). **Đọc** chỉ khi đúng tab + đúng tag + đúng generation + đúng URL + trong
  `min(expiresAt bản ghi, hạn ngữ cảnh)` và đồng hồ không lùi > 5 s; trả kèm `X-XBoss-Offline-Cache: 1`.
- `CLEAR_CACHE` (đăng xuất, actor đổi, **nay cả đổi dự án** ở `ProjectSwitcher`/`portfolio`): tăng
  generation, xoá mọi cache sở hữu (gồm API) **và** mọi ngữ cảnh tab, rồi mới ACK; response về muộn của
  generation cũ không ghi lại.

### 5. Browser acceptance

`e2e/authed/offline-recovery.spec.ts` (authed-desktop + authed-mobile, tự đăng nhập tài khoản demo
`pm`/`engineer` — không đăng xuất phiên admin dùng chung): (a) tick khi `setOffline(true)` → chip "lưu
trên thiết bị" + badge → online → PATCH có `Idempotency-Key` → badge về 0, IDB rỗng; (b) A tạo op (PATCH bị
cắt như lỗi mạng), đăng xuất, B đăng nhập cùng trình duyệt → không badge/chip, không PATCH ô nào, IDB vẫn
1 ciphertext của A; (c) màn phục hồi: focus tiêu đề, `aria-live`, axe không serious/critical ở theme
`light` + `darkblue`, Esc đóng và trả focus về badge; (d) SW: mất mạng → GET lưới đã đọc trả 200 kèm
`X-XBoss-Offline-Cache: 1`; `/api/costs`, `/api/payment-certs`, `/api/contracts`, `/api/auth/me`, `/api/users`
lỗi mạng. Server E2E có `XBOSS_OFFLINE_KEK` qua `E2E_OFFLINE_KEK` (giá trị TEST trong `e2e/constants.ts`,
`playwright.config.ts` chuyển vào webServer; allowlist `.gitleaks.toml`) — không cần sửa workflow CI.

## Tiêu chí chấp nhận

- A2-AC01: sau đăng xuất tab không còn bản rõ giải mã, badge không đếm op của A; B cùng trình duyệt không
  thấy/không gửi op/nháp của A; ciphertext của A còn nguyên để chính chủ phục hồi (unit + E2E).
- A2-AC06/AC10: conflict/rejected chỉ biến mất khi người dùng xác nhận bỏ **đúng** op đó; op chờ/đang
  gửi, op chủ khác, legacy không bao giờ bị bỏ qua màn phục hồi.
- A2-FR11: giữ bản thiết bị tạo op mới (operationId mới, `If-Match` = etag máy chủ vừa xem); op cũ chỉ bỏ
  sau khi op mới commit; lưu op mới thất bại → op cũ còn nguyên; có bản mới hơn → không cho giữ.
- A2-AC09: API ngoài allowlist network-only, tài chính/auth/offline/SSE network-only kể cả khi allowlist
  bị nới; online 401/403/404/409/5xx trả nguyên và xoá bản cũ; hết lease/khác tab/khác phiên/sau
  CLEAR_CACHE → không phục vụ cache.
- Màn phục hồi: axe không serious/critical (desktop + mobile, 2 theme), focus tiêu đề khi mở, Esc trả focus,
  vùng `aria-live`.
- `test:mutation`: +4 mutation S08 (chỉ bỏ op conflict/rejected, op cũ chỉ bỏ sau op mới, đăng xuất quên
  chủ cũ, tài chính network-only) đều bị bắt.

## Bằng chứng

- Unit: `tests/audit-s08-offline-recovery.test.ts` (9 ca), `tests/audit-s08-sw-allowlist.test.ts` (9 ca),
  `tests/service-worker-cache-ack.test.ts` (+ thông điệp đăng xuất), `tests/audit-sw-network-only.test.ts`
  (version v21).
- E2E Chromium (bản build production `next build --webpack` cục bộ, Chromium 1194 dựng sẵn): spec mới
  8/8 ca (2 lượt DB mới), cùng các spec liên quan (tracking, ngữ cảnh khoá, account, project-switcher,
  portfolio, modal-a11y, diary, appshell, offline/login công khai). Bản build Turbopack cục bộ **NOT_RUN**
  (môi trường worktree không dựng được Turbopack) — CI build Turbopack thật.
- **Safari/iOS thật: NOT_RUN** (không có thiết bị/WebKit trong CI) — fallback foreground (online/
  visibility/poll 30 s) không phụ thuộc Background Sync; cần kiểm tay trên iPhone trước release.

## Ngoài phạm vi

- Đối soát legacy v1 theo thiết bị với người vận hành (D03) — màn chỉ đếm + hướng dẫn liên hệ quản trị.
- Server đối chiếu op với manifest khoá / kiểm `X-XBoss-Context` cho request online (còn mở từ S07).
- Thứ tự FIFO khi op cũ không giải mã được (khoá rotate/thu hồi) — giữ hành vi S07 (không chặn).
- Xem/giải quyết xung đột cho tick/ảnh (chỉ "bỏ" hoặc chờ) — nội dung tick/ảnh không có phiên bản để so.
- Cache đọc ngoài lưới tracking (dashboard, nhật ký, danh sách task cá nhân) — cần quyết định profile
  riêng; HTML/RSC vẫn network-only nên tải lại trang khi mất mạng vẫn về `/offline`.
