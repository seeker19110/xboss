# Đánh giá tổng hợp — nâng cấp còn lại (2026-07-17)

> Gộp kết quả rà toàn bộ `docs/*.md` (9 file cấp gốc + `docs/nang-cap/` + `docs/adr/` +
> `docs/ops/` + `docs/a11y/` + `docs/framework/`) để trả lời: **còn hạng mục nâng cấp
> nào chưa triển khai? còn hạng mục nào chưa có đặc tả?** Kết luận dùng để lập
> `PLAN.md` đợt 2026-07-17.

## Phương pháp

Đối chiếu `PROGRESS.md` (nguồn chân lý về đã-làm) với danh mục module trong
`docs/nang-cap/README.md` + nội dung thật của từng file `M<xx>-*.md` còn "chưa gộp vào
G<nn>" (tức chưa triển khai xong) + toàn văn `docs/nghien-cuu-nang-cap-erp-2026-07.md`
(nguồn gốc mọi đề xuất M43-M52) để xem có ý tưởng nào ngoài phạm vi M43-M52 nhưng chưa
được viết thành file đặc tả riêng.

## Kết luận 1 — Không còn ý tưởng nâng cấp nào thiếu đặc tả

`docs/nghien-cuu-nang-cap-erp-2026-07.md` (9 trục, viết 07/2026) là nguồn duy nhất đề
xuất hạng mục mới; toàn bộ 9 trục đã được chuyển hết vào 10 file đặc tả `M43-M52`
(`docs/nang-cap/README.md` bảng "Đặc tả chờ triển khai"). 6 file `docs/ke-hoach-*.md`
khác từng ở cấp gốc (`ke-hoach-fastcons`, `ke-hoach-nang-cap-he-thong`, `ke-hoach-ia-chi-tiet`,
`ke-hoach-appshell-full-ia`, `ke-hoach-nang-cap-2026-07`, `ke-hoach-ux-cai-tien`) đều là
kế hoạch **lịch sử đã chốt hướng đi và đã triển khai xong** (M0–M42) — không còn hạng
mục nào trong đó chưa có đặc tả `M<xx>`; **đã xoá khỏi repo cùng đợt này** (2026-07-17,
theo yêu cầu người dùng) vì hết giá trị tra cứu — nội dung quyết định gốc vẫn còn trong
`PROGRESS.md` (log lịch sử) và các file `M<xx>-*.md`/`G<nn>-*.md` tương ứng.

**Không cần viết đặc tả mới.**

## Kết luận 2 — Trạng thái triển khai M43–M52

| Module | Trạng thái | Ghi chú |
| --- | --- | --- |
| M43 Audit trail | ✅ Xong cả 3 PR | `PROGRESS.md` dòng ~35-113 |
| M44 Vận hành | ✅ Xong (backup/health/logging/staging) | Sentry DSN chờ ops đặt tay (ngoài code) |
| M45 Chất lượng dữ liệu | ✅ Xong | money.ts, CHECK, ERD tự sinh, soft-delete |
| M46 Approval engine | ✅ Xong (dormant tới khi có flow thật) | |
| M47 EVM & BI | ✅ Xong cả 4 PR | EVM/matviews/saved-reports/alert_rules |
| M48 Tích hợp tài chính | ⏸ PR1 xong; PR2/PR3 khoá | Chờ công ty chốt NCC kế toán/HĐĐT thật — **không tự đoán** |
| M49 API mở & SSO | ⏸ PR1/PR2 chưa thấy trong PROGRESS; PR3 code xong, PR #218 draft chưa merge | PR3 chờ verify tay với IdP thật; **PR1 (api keys/`/api/v1`) và PR2 (webhook ra ngoài) CHƯA triển khai — không nhắc tới trong PROGRESS.md dù đặc tả đã kín** |
| M50 Phân quyền nâng cao | ✅ Xong cả 3 PR | |
| **M51 Đa dự án cấp 2 (RLS)** | ❌ **Chưa triển khai** | Đặc tả kín, nhưng **PR1/PR2 đụng cấu hình production** (role Postgres mới, tách `MIGRATE_DATABASE_URL`, ADR-0005) — đợt kế hoạch M50 trước đã ghi rõ "không code khi chưa xác nhận sẵn sàng" |
| **M52 Mở rộng cấu hình** | ❌ **Chưa triển khai** | Đặc tả kín, thuần code (không đụng production), độc lập |

## Phát hiện thêm ngoài dự kiến: M49 PR1 + PR2 cũng chưa làm

Khi rà `docs/nang-cap/M49-api-mo-sso.md` đối chiếu code thật: chỉ thấy dấu vết PR3 (SSO)
đã code (`lib/oidc.ts`, route `/api/auth/oidc/*`, PR #218). **Không tìm thấy** `api_keys`,
namespace `/api/v1/*`, hay bảng `webhooks`/`webhook_deliveries` trong `migrations/`.
`PROGRESS.md` mục "Đang làm" chỉ nhắc PR3, không nhắc PR1/PR2 — có thể đã bị bỏ sót khi
sắp thứ tự triển khai (PLAN M50 trước chỉ ghi "M49 (P3) xếp sau P2" mà không tách riêng
PR1/PR2 khỏi PR3). PR1/PR2 **không đụng production**, đặc tả kín — đưa vào phạm vi đợt
kế hoạch tiếp theo cùng M51 PR3 + M52 nếu người dùng đồng ý (xem PLAN.md).

## Phạm vi đợt kế hoạch 2026-07-17 (theo xác nhận người dùng)

Người dùng chưa xác nhận rõ ràng sẵn sàng đổi cấu hình Postgres production ngay lúc
này ("nào tốt thì triển khai" — không phải "có, tôi sẵn sàng đổi role production") →
theo luật cứng CLAUDE.md, **không đưa M51 PR1/PR2 (RLS) vào đợt này**. Đợt này gồm:

1. **M51 PR3** — Template dự án (clone-config) — không đụng RLS/production.
2. **M52 PR1–PR5** — code_lists, custom fields, module registry, feature flags, tách
   trang tracking — thuần code.
3. **M49 PR1** — API keys + `/api/v1` (đọc-only) — thuần code, không đụng auth hiện có.
4. **M49 PR2** — Webhook ra ngoài — thuần code.

M51 PR1/PR2 (RLS) + PR4 (organizations, YAGNI theo đặc tả) **để dành đợt sau**, hỏi lại
khi người dùng sẵn sàng đổi cấu hình production. Chi tiết từng việc, route, brief, tiêu
chí chấp nhận: xem `PLAN.md`.
