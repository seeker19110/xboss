# Kiểm chứng nhánh nợ kỹ thuật — 26/10/2026

Baseline main: `0f5cef55e914711a0d004411d4123c5a966e3c25`.
Nhánh: `codex/hoan-thien-no-ky-thuat-2026-10-26`.
Node24.22.1/npm11.19.1, `npm ci` đúng lock; PostgreSQL16 disposable bind loopback, DB unit
và E2E tách riêng. Không production DB/secret/provider thật; chưa merge/deploy.

## Targeted và kiểm chứng nguồn

- RED config: XSS header cũ là `1; mode=block`, assertion kỳ vọng `0` thất bại.
- RED deploy:9 test mới có5fail/4pass trên script baseline; reload lỗi không phục hồi build,
  deploy đầu health lỗi xoá build dù không có bản cũ.
- GREEN deploy:51/51 pass,0fail/cancel/skip (9mới+42cũ), `bash -n deploy.sh` đạt. Harness dùng
  executable giả và thư mục tạm, không gọi PM2/Git/npm/network/DB thật.
- 68 targeted auth/CSRF/migration/API-key/rate-limit pass,0fail/skip sau migrate tường minh.
  Lượt chuẩn bị đầu trên DB trắng thất bại đúng contract runtime chỉ đọc schema marker;
  không sửa test hoặc runtime để bypass.
- HTTP HEAD public HTTPS trả200/HSTS ngày26/10; không auth hoặc ghi production.
- `npm audit`:0 vulnerability cả dependency/dev tại thời điểm chạy.
- `npm audit signatures --omit=dev`:412 registry signatures và125 attestations xác minh,
  exit0. Đây là kiểm cây production hiện tại, không bảo đảm các bản phát hành tương lai.
- XLSX upstream:26 file,24 giống từng byte; chỉ README/package metadata khác, không file thiếu/thừa.
- GitHub classic protection404; effective rules xác nhận ruleset22365300 active yêu cầu PR
  và ci/e2e/gitleaks/metadata, không bypass actor. ci bắt buộc static/typecheck, test, coverage, build.
- Inventory tĩnh:396 route files/631 handlers/171 migration;98 ứng viên SQL sau loại thông báo lỗi.
  Không kết luận toàn bộ authz an toàn từ scan; `bash -n deploy.sh` đạt.

## Cổng toàn bộ

- Full unit mới nhất:386file/5.174pass/0fail/1skip health allowlist, release-gate exit0.
  Trước bổ sung9test deploy:385file/5.165pass/0fail/1skip; không cộng trùng hai lượt.
- Lượt full E2E đầu:1.121pass/5fail/51skip cũ,retries0. Ba nguyên nhân và bản vá ở báo cáo.
- RED tương phản với fixture đúng:2light fail tại axe/2darkblue pass+setup, đủ4nhãn trước đo.
  Lượt viết fixture đầu nhầm label “Biên bản” đã sửa đúng “Bản vẽ / tài liệu”; không tính lỗi
  locator đó là bằng chứng contrast. Hai ca RED role chậm xác nhận form cũ không có guard.
- GATE đầu19/19 gồm build; sau thêm test deploy, typecheck phát hiện thiếu NODE_ENV trong
  env fixture, đã sửa. Gate cuối19/19 gồm build và check:ui-ux đạt; targeted UI53/53 đạt
  desktop/mobile,retries0. Full E2E cuối1.132pass/0fail/51skip cũ,retries0,exit0 (7,4phút).
  Không skip mới, không giảm assertion/ngưỡng.

## Lệnh kiểm cuối

- `npm run gate -- --build`:19/19, gồm lint/typecheck/sw-exclude/migrations và các static gates.
- `npm run check:ui-ux`:PASS.
- `npm test -- --release-gate`:386file/5.174pass/0fail/1skip allowlist; env mirror CI với
  PostgreSQL16 disposable, marker, client16 và tài khoản giả; đây là lượt local, không phải Actions.
- `npm run test:e2e -- --workers=4 --retries=0`:1.132pass/0fail/51skip có sẵn, desktop/mobile
  và axe. Dùng DB E2E riêng, thư viện browser local; không đổi executable hoặc test runner config.
- `sha256sum --check source-sha256.txt`, `git diff --cached --check`:PASS trước commit.

Review độc lập: docs/evidence và95local link targets, deploy sandbox, guard nhật ký, contrast
labels và oracle DnD không có finding chặn; hai chỉnh sửa comment/docs đã xử lý. CI theo HEAD
PR là bằng chứng riêng sau push; chưa merge/deploy.

## Phạm vi và giới hạn

Runtime app sửa header XSS Auditor, guard chờ quyền trong editor nhật ký và màu chữ hoạt động;
HTTP regression giữ CSP/DENY/nosniff. Calendar vẫn tải độc lập quyền; API/RBAC không đổi.
Deploy script phục hồi build khi reload lỗi, giữ candidate nếu không có bản cũ và báo lỗi rõ
khi reload phục hồi cũng thất bại. Không triển khai hoặc test trên VPS.
Tài liệu sửa trạng thái cũ và thêm M138 In review. Auth/cookie/proxy policy chưa đổi.
UI thêm6regression theme/quyền chậm và sửa oracle DnD giữ10assertion cũ. Không thay người thật/
Safari/cảm ứng hoặc chứng minh usage; không đổi token global, deadline, retry hoặc skip allowlist.
Mọi số liệu CI/deploy #686 ở [release riêng](../meetings-proposals-2026-10/release.md),
không gộp vào kết quả local mới. [Hash các source đã kiểm](source-sha256.txt) dùng để đối chiếu trước commit.
Raw logs cục bộ: `.autopilot/hoan-thien-2026-10-26/`.
