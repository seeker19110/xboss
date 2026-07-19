# Changelog

Mọi thay đổi đáng kể của dự án được ghi ở đây.

Định dạng theo [Keep a Changelog](https://keepachangelog.com/vi/1.1.0/),
và dự án tuân theo [Semantic Versioning](https://semver.org/lang/vi/).

> Vì commit theo _conventional commits_, phần "Unreleased" có thể được sinh tự động sau
> (ví dụ `standard-version` / `changesets`). Trước mắt cập nhật tay khi có thay đổi đáng kể.

## [Unreleased]

### Added (Thêm)

-

### Changed (Đổi)

-

### Fixed (Sửa)

-

### Removed (Bỏ)

-

## [0.1.0]

### Added (Thêm)

- danh mục mềm code_lists (M52 PR1) (#222) ([1bfd697](https://github.com/seeker19110/xboss/commit/1bfd697))
- API keys đọc-only + namespace /api/v1 (M49 PR1) (#223) ([6f950a2](https://github.com/seeker19110/xboss/commit/6f950a2))
- M52 PR2 — custom fields cho 4 entity (#226) ([44c120f](https://github.com/seeker19110/xboss/commit/44c120f))
- template dự án — clone-config sao chép cấu hình (M51 PR3) (#224) ([ba0bf8c](https://github.com/seeker19110/xboss/commit/ba0bf8c))
- M52 PR4 — cờ tính năng theo dự án (feature_flags) (#229) ([ebe02f1](https://github.com/seeker19110/xboss/commit/ebe02f1))
- M49 PR2 — Webhook ra ngoài có ký HMAC (#230) ([e5391c1](https://github.com/seeker19110/xboss/commit/e5391c1))
- M52 PR4 mở rộng feature-flag enforcement — 3 module tracking/field/materials (#234) ([c3d4706](https://github.com/seeker19110/xboss/commit/c3d4706))
- scope API 4 module quản trị theo dự án (M52 PR4 tiếp) (#235) ([370d8c1](https://github.com/seeker19110/xboss/commit/370d8c1))

### Fixed (Sửa)

- a11y & permissions — admin config pages + PO access control (#232) ([b6e2b96](https://github.com/seeker19110/xboss/commit/b6e2b96))

### Docs (Tài liệu)

- kế hoạch M49 PR3 — SSO OIDC bằng openid-client (#219) ([49ffb37](https://github.com/seeker19110/xboss/commit/49ffb37))
- đánh giá nâng cấp còn lại + lập PLAN.md đợt M51 PR3/M52/M49 PR1+PR2 (#221) ([1a4b7a6](https://github.com/seeker19110/xboss/commit/1a4b7a6))
- gộp Nhóm 2 (chất lượng) vào audit.md, xoá contrast-audit.md (#231) ([7e1d868](https://github.com/seeker19110/xboss/commit/7e1d868))
- M53–M59 — lộ trình Scale, SaaS, BI, 2FA, tìm kiếm, mobile, tài nguyên ([1508e23](https://github.com/seeker19110/xboss/commit/1508e23))
- lập kế hoạch M53 (Scale headroom) song song M57 PR1 (FTS) (#236) ([d6d6dd9](https://github.com/seeker19110/xboss/commit/d6d6dd9))
- cập nhật số liệu test + ghi nhận nợ trùng số migration 0060 (#238) ([186c139](https://github.com/seeker19110/xboss/commit/186c139))

### Changed (Đổi)

- M52 PR3 — module registry lib/modules.ts (#227) ([4fbc950](https://github.com/seeker19110/xboss/commit/4fbc950))
- M52 PR5 — tách app/tracking/[sheet]/page.tsx (3246 dòng) (#228) ([5e4db9c](https://github.com/seeker19110/xboss/commit/5e4db9c))

### Chore (Bảo trì)

- bump @commitlint/cli from 21.2.0 to 21.2.1 (#177) (**deps-dev**) ([22455a3](https://github.com/seeker19110/xboss/commit/22455a3))

### CI

- xếp hàng deploy VPS tuần tự, tránh 2 lượt push liên tiếp đá nhau (#220) ([6af47b8](https://github.com/seeker19110/xboss/commit/6af47b8))

## [0.2.0]

### Added (Thêm)

- 2FA/TOTP cho tài khoản mật khẩu (M56 PR1) (#237) ([a38b92c](https://github.com/seeker19110/xboss/commit/a38b92c))
- SSO OIDC đăng nhập qua IdP công ty (M49 PR3) (#218) ([4fe5dfc](https://github.com/seeker19110/xboss/commit/4fe5dfc))
- M61 PR1 — override quyền theo dự án (nền migration + cache + giải quyền + API) (#248) ([7ceb12e](https://github.com/seeker19110/xboss/commit/7ceb12e))
- M61 PR2 — UI ma trận phạm vi dự án + export snapshot (#249) ([9fd7cde](https://github.com/seeker19110/xboss/commit/9fd7cde))
- M58 PR1 — QR resolve + tem in (#253) ([8671a41](https://github.com/seeker19110/xboss/commit/8671a41))
- M53 (Scale headroom PR1-3) + M57 PR1 (Tìm kiếm toàn văn) (#252) ([cefda6a](https://github.com/seeker19110/xboss/commit/cefda6a))
- RLS phòng tuyến DB — M51 GĐ0 (PR1 RLS + PR2 withProjectScope + PR4 organizations) (#256) ([6c8bcf2](https://github.com/seeker19110/xboss/commit/6c8bcf2))

### Fixed (Sửa)

- sửa badge audit-log không đủ tương phản WCAG AA (#242) (**a11y**) ([8810107](https://github.com/seeker19110/xboss/commit/8810107))
- bỏ type-check trong next build để tránh OOM-kill trên VPS (#244) (**deploy**) ([4e556c8](https://github.com/seeker19110/xboss/commit/4e556c8))

### Docs (Tài liệu)

- đặc tả M60 — kế hoạch nâng 3 major deps đang giữ lại (TS 7, ESLint 10, Node 26) (#240) ([2ccd9e8](https://github.com/seeker19110/xboss/commit/2ccd9e8))
- ghi nhận quyết định merge SSO OIDC trước, xác minh IdP sau (#241) ([0c113f1](https://github.com/seeker19110/xboss/commit/0c113f1))
- cập nhật README bộ đặc tả theo tiến độ thực (M0–M52 + M56 PR1 xong) (#243) ([24fa5b8](https://github.com/seeker19110/xboss/commit/24fa5b8))
- M61 — Override quyền theo dự án (role_permissions.project_id) (#246) ([a1f9e20](https://github.com/seeker19110/xboss/commit/a1f9e20))
- cập nhật PROGRESS.md sau M61 + bắt buộc đồng bộ tài liệu khi commit tính năng (#250) ([a8f363a](https://github.com/seeker19110/xboss/commit/a8f363a))
- đồng bộ PR #247 (kế hoạch M56 PR2) với main sau khi M61 merge (#251) ([a332b71](https://github.com/seeker19110/xboss/commit/a332b71))
- đồng bộ PR #254 (M58 PR2 offline queue) với main sau M58 PR1 (#255) ([9c3fcc7](https://github.com/seeker19110/xboss/commit/9c3fcc7))
- cập nhật PROGRESS.md/README sau khi merge PR #256 (M51 GĐ0) (#258) ([d576776](https://github.com/seeker19110/xboss/commit/d576776))

### Chore (Bảo trì)

- cập nhật nhóm bản vá an toàn (patch/minor) (#239) (**deps**) ([b3deb29](https://github.com/seeker19110/xboss/commit/b3deb29))
- gỡ trùng số 0060, đổi 0060_webhooks → 0064 + guard CI (#245) (**migrations**) ([a819d62](https://github.com/seeker19110/xboss/commit/a819d62))

## [0.3.0]

### Added (Thêm)

- M56 PR2 — bắt buộc 2FA theo vai trò (#259) ([7f3c5d2](https://github.com/seeker19110/xboss/commit/7f3c5d2))
- M53 PR4 — audit cluster-ready + khoá chống gửi trùng báo cáo ([6e4d452](https://github.com/seeker19110/xboss/commit/6e4d452))
- M57 PR2 — tìm trong nội dung text PDF đính kèm (#266) ([093953e](https://github.com/seeker19110/xboss/commit/093953e))
- M59 PR1 — API tổng hợp tài nguyên + trang /resources ([e55c443](https://github.com/seeker19110/xboss/commit/e55c443))
- M58 PR3 — wire ảnh + nhật ký hiện trường vào khung offline queue ([2e28419](https://github.com/seeker19110/xboss/commit/2e28419))
- M55 PR1 — schema bi + view whitelist + role chỉ-đọc xboss_bi ([4ef9a1e](https://github.com/seeker19110/xboss/commit/4ef9a1e))

### Fixed (Sửa)

- M56 PR2 — đóng nợ auto-redirect + vá 2 lỗi reload/trang trắng ([63f626d](https://github.com/seeker19110/xboss/commit/63f626d))
- lọc project_id cho GET /api/payments/bills và /floors chống rò rỉ chéo dự án (#263) ([45fc00c](https://github.com/seeker19110/xboss/commit/45fc00c))
- add project-scoped filtering & idempotency to payments & materials APIs (#265) ([5ed7384](https://github.com/seeker19110/xboss/commit/5ed7384))
- đổi số migration 0071_material_tx_idempotency thành 0072 tránh trùng (#269) ([13b71b5](https://github.com/seeker19110/xboss/commit/13b71b5))
- M55 PR1 — bi.cash_fin lấy project_id trực tiếp từ payment_bills ([f1cfafa](https://github.com/seeker19110/xboss/commit/f1cfafa))
- rm -rf .next trước khi mv OLD_DIR về .next trong nhánh rollback deploy.sh ([a66445a](https://github.com/seeker19110/xboss/commit/a66445a))

### Docs (Tài liệu)

- đồng bộ PROGRESS.md/README.md nợ đặc tả với code thật sau PR #252 (#257) ([3fd7b4f](https://github.com/seeker19110/xboss/commit/3fd7b4f))
- cập nhật PROGRESS.md sau khi merge PR #263, chờ merge PR #262 (#264) ([d851b5e](https://github.com/seeker19110/xboss/commit/d851b5e))
- ghi nhận sự cố trùng số migration 0071 + số kế tiếp đúng (0073) (#268) ([767e303](https://github.com/seeker19110/xboss/commit/767e303))
- M55 PR2 — tài liệu vận hành Metabase self-host ([fd3eccd](https://github.com/seeker19110/xboss/commit/fd3eccd))
- lập PLAN.md đợt nâng cấp chuyên nghiệp hoá + bổ sung quy trình audit chiến lược ([581b544](https://github.com/seeker19110/xboss/commit/581b544))

### Chore (Bảo trì)

- cập nhật PLAN.md — kế hoạch thi hành M55 BI Metabase (#261) ([5bccdbc](https://github.com/seeker19110/xboss/commit/5bccdbc))
- cập nhật PLAN.md — kế hoạch thi hành M58 PR3 + M59 PR1 (#267) ([f06a1ee](https://github.com/seeker19110/xboss/commit/f06a1ee))
- M55 — đổi migration 0071 → 0073 + update docs ([20fe25d](https://github.com/seeker19110/xboss/commit/20fe25d))
- thêm health-check + rollback cho deploy.sh, gate deploy.yml theo CI thật ([58d904e](https://github.com/seeker19110/xboss/commit/58d904e))
