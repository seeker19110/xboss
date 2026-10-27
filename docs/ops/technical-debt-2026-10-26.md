# Đối soát nợ kỹ thuật — 26/10/2026

Baseline: `origin/main` = `0f5cef55e914711a0d004411d4123c5a966e3c25`.
Yêu cầu chủ dự án: “pull và hoàn thiện”, chọn cả nợ kỹ thuật, bàn giao #686 và kế hoạch còn mở.
Pull `--ff-only` không có commit mới; bản ghi TD-001–007 chưa commit được giữ và kiểm chứng lại.

Đây là audit hẹp của bảy nhận định và trạng thái bàn giao, không phải nghiệm thu toàn bộ
1.152 MUST/639 SHOULD hoặc chứng nhận toàn sản phẩm. Ba lượt khảo sát độc lập đọc code,
spec, lịch sử và GitHub; kiểm thử mới dùng PostgreSQL 16 disposable.

## Kết quả và việc còn mở

| ID     | Kết luận có bằng chứng                                                                                                                                                                                                                         | Xử lý / người thực hiện                                                                                                                                                                                                                    |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| TD-001 | Login/2FA/OIDC/API key lấy IP đầu XFF; e-sign lấy nguyên header. PM2 bind `0.0.0.0`. Chưa xác minh firewall và cách proxy ghi đè header, nên chưa xác nhận khai thác trên production.                                                          | [AI] Sửa hướng dẫn truy cập trực tiếp trong DEPLOY, ghi contract proxy. [M138](../nang-cap/M138-cung-co-ranh-gioi-proxy-cookie.md) ở In review; [Người dùng/operator] chốt topology và bằng chứng cổng app bị chặn trước đổi trust policy. |
| TD-002 | CSP inline là đánh đổi đã ghi từ 16/07, không phải capability còn thiếu. HEAD HTTPS ngày 26/10 trả HSTS `max-age=31536000; includeSubDomains`. Header XSS cũ vẫn là `1; mode=block`.                                                           | [AI] Chuyển riêng XSS Auditor sang `0`, thêm kiểm HTTP `/login`. CSP/nonce cần nghiên cứu/spec riêng; HSTS hiện diện không chứng minh proxy/IP an toàn.                                                                                    |
| TD-003 | Bỏ typecheck trong Next build có chủ đích tránh OOM. Ruleset `main` (22365300) active yêu cầu PR và `ci/e2e/gitleaks/metadata`; `ci` cần static/typecheck, test, coverage và build. Không có bypass actor trong ruleset này.                   | [AI] Đã đối soát effective rules và sửa hướng dẫn CLAUDE cũ. Classic protection404 không có nghĩa nhánh không được bảo vệ; không cần đổi Settings để đóng nhận định này.                                                                   |
| TD-004 | Thiếu Origin được cho qua có chủ đích và có test; route vault dùng helper strict. Cookie OIDC production theo spec M49; thiếu flags trên cookie xoá chưa đủ kết luận lỗ hổng.                                                                  | [AI] Chuẩn bị M138 cho cookie consistency. Giữ policy CSRF hiện hành; chưa sửa auth trước approval.                                                                                                                                        |
| TD-005 | Alias là bản republish, không phải fork logic đã chứng minh khác. Lý do từ #23: CDN SheetJS bị chặn ở môi trường cũ. Đã so gói cài theo lock với tarball chính thức cùng phiên bản.                                                            | [AI] Ghi nguồn, integrity, khác biệt và giới hạn bên dưới; giữ dependency/lockfile.                                                                                                                                                        |
| TD-006 | Có **0 `@ts-ignore`, 0 `@ts-nocheck`, 49 `eslint-disable`** trong app/lib. Bốn page dài 1.881–2.017 dòng là rủi ro bảo trì, chưa phải bằng chứng lỗi người dùng.                                                                               | [AI] Sửa phân loại; giữ backlog tách component theo từng miền với regression phù hợp. Không xóa hàng loạt ngoại lệ hook/ảnh chỉ để giảm số đếm; không đổi luồng tiền/nghiệm thu từ số dòng.                                                |
| TD-007 | Inventory có 396 route files/631 handlers và 171 migration liên tục. Quét AST tìm 99 template có từ khóa SQL, trong đó một là thông báo lỗi. Các nhóm dynamic đã đọc dùng whitelist/fragment cố định/placeholder; chưa xác nhận SQL injection. | [AI] Sửa mô tả DB/bootstrap và lỗi rollback build khi PM2 reload thất bại, có hồi quy sandbox. Audit toàn bộ authz vẫn PARTIAL; kết quả tĩnh không thay kiểm thử từng handler.                                                             |

Nguồn code trọng yếu: `app/api/auth/login/route.ts`, `app/api/auth/login/2fa/route.ts`,
`app/api/auth/oidc/callback/route.ts`, `lib/bao-mat/api-keys.ts`,
`app/api/engineering/esign/sign/route.ts`, `lib/bao-mat/csrf.ts`, `next.config.mjs`,
`ecosystem.config.js`, `lib/db/index.ts`, `lib/db/migrate.ts`, `lib/bao-mat/auth.ts`.
Đánh đổi lịch sử: `docs/archive/PROGRESS-before-2026-09-25.md` mục audit 16/07;
`docs/nang-cap/M49-api-mo-sso.md`; `docs/ops/security-audit-2026-09-27.md`.

## Bản vá cấu hình XSS Auditor

Assertion baseline đọc config nhận `1; mode=block` khi kỳ vọng `0` (RED). Bản vá chỉ đặt
`X-XSS-Protection: 0`; giữ CSP, DENY và nosniff. Kiểm thử mới gọi HTTP bản production
thật, chạy cả public desktop/mobile, kiểm status và các header bảo vệ này.

[OWASP Secure Headers](https://secure-headers-project.owasp.org/response-headers/#x-xss-protection)
khuyến nghị `0` để tắt bộ lọc cũ có thể tạo thêm rủi ro. Đây là sửa cấu hình lỗi thời,
không thêm capability, thay auth hoặc đưa CSP nonce chưa duyệt vào runtime.

## Nguồn gói XLSX

- Quyết định gốc: commit `8b20de238f66e5d356ddffb5183bdf384340dd0b`,
  [PR #23](https://github.com/seeker19110/xboss/pull/23), ngày 25/06/2026. Chuyển CDN
  sang npm alias để cài trong mạng giới hạn, giữ imports `xlsx`.
- Lock cài `@e965/xlsx@0.20.3` từ npm registry, repository metadata
  [e965/sheetjs-npm-publisher](https://github.com/e965/sheetjs-npm-publisher), maintainer `e965`.
- Registry quảng bá SLSA provenance attestation. Sự hiện diện metadata này chưa phải
  kết luận đã xác minh chữ ký/attestation hoặc đánh giá toàn bộ quy trình phát hành.
- [Nguồn chính thức SheetJS](https://docs.sheetjs.com/docs/getting-started/installation/nodejs/)
  chỉ tarball `https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz` cho phiên bản này.
  Tải ngày 26/10 thành công; SHA256:
  `8dc73fc3b00203e72d176e85b50938627c7b086e607c682e8d3c22c02bb99fe8`.
- So sánh 26 file với gói alias cài bằng `npm ci`: **24 file giống từng byte, không thiếu/thừa**.
  Hai file khác là `README.md` và `package.json`; JSON chỉ khác `name` và `repository`.
  Các file mã thực thi/phân phối còn lại giống tarball chính thức.
- Kết luận chỉ cho artifact 0.20.3 đã kiểm; không bảo đảm bản tương lai. Không đổi về gói
  `xlsx` cũ trên npm, không thêm dependency hay sửa lock trong lát này.

## Ngoại lệ ESLint và page dài

`rg -n '@ts-ignore|@ts-nocheck|eslint-disable' app lib` cho 49 dòng ESLint. Đây không phải
49 lỗi kiểu bị giấu. Nhiều dòng là ảnh từ upload động và effect có dependency cố ý;
mỗi lần bỏ ngoại lệ cần chứng minh behavior không đổi.

| Page                        | Số dòng baseline |
| --------------------------- | ---------------- |
| `app/payments/page.tsx`     | 2.017            |
| `app/mepf-process/page.tsx` | 1.913            |
| `app/handover/page.tsx`     | 1.890            |
| `app/quality/page.tsx`      | 1.881            |

Tách page theo lát bảo trì độc lập; không gộp bốn miền vào một refactor. Tiêu chí là giảm
coupling và giữ regression/permission/data contract, không chỉ giảm số dòng. Tài liệu lịch sử
lớn đã nằm trong archive không được xoá bằng chứng để làm số đo đẹp hơn.

## Audit SQL, auth và vận hành

Đã đối chiếu query helper chuyển placeholder rồi truyền riêng params; tên bảng/cột động mẫu
được lấy từ literal whitelist. `getCurrentUser` kiểm HMAC, disabled/password fragment/
session_version/org trước gắn actor. Không có kết luận audit đủ 631 handler.

Harness biệt lập đã xác nhận lỗi: `pm2 reload` dưới `set -e` nằm trước vòng rollback/health;
reload lỗi sau swap làm script thoát27, giữ build mới và bỏ qua phục hồi build cũ, ở cả
production/staging. Control health lỗi có rollback; deploy đầu health lỗi còn xoá build mới
rồi tìm bản cũ không tồn tại. Không thử trên VPS.

Bản vá mức S dùng chung nhánh phục hồi build cho reload/health failure; kiểm bản cũ tồn tại
trước xoá `.next`, giữ artifact khi lỗi. Nếu reload bản cũ cũng lỗi, báo cần operator kiểm
process và trả lỗi; không tuyên bố app đã healthy. Không hoàn tác source/dependency/migration.
Test mới `tests/deploy-rollback.test.ts`: RED5fail/4pass; sau vá,9/9 đạt. Cùng42 hồi quy deploy
hiện hữu là51/51 pass,0skip. Fake Git/npm/PM2/curl/sleep, filesystem chỉ trong thư mục tạm;
`bash -n deploy.sh` đạt. Không gọi DB/provider/network hoặc dùng secret thật trong harness.

Ba mô tả cũ trong CLAUDE được sửa theo code/ADR hiện tại: runtime chỉ đọc marker schema,
migrator bắt buộc credential riêng, production không tự tạo admin. Lần targeted đầu trên DB
trắng bị từ chối đúng contract; sau migrate tường minh, 68 test auth/CSRF/migration/key/rate-limit
đạt, 0 fail/skip. Không dùng production DB, OIDC provider hay secret thật.

## Bàn giao phát hành và goal

#686 đã merge và deploy trên đúng main SHA; [release](evidence/meetings-proposals-2026-10/release.md)
đối chiếu trực tiếp jobs/run SHA. Goal trải nghiệm giữ F2 UAT/F3 usage WAITING theo owner.
Ba goal tháng 8 về Product/Vision/Pinnacle phải đọc checkpoint 26/10: manifest còn Draft,
nhiều module đã được owner gỡ, lịch sử DONE không là giấy phép khôi phục capability.
QUALITY-FINAL-1 giữ PARTIAL, các slice A1/A2/A4/A5 đã có bằng chứng được phân biệt với toàn bộ AC.

## Phát hiện trong cổng E2E và bản vá mức S

Lượt E2E đầy đủ đầu sau cài đủ dependency:1.121pass/5fail/51skip cũ, retries0. Không coi
test lỗi là pass hoặc bỏ qua vì vùng đó chưa đổi. Năm failure thuộc ba nguyên nhân:

- **Nhật ký:** lịch trả về trước `/api/auth/me`; form nhận role rỗng vẫn cho nhập, rồi
  `canEdit` đổi khi quyền về khiến effect nạp lại nội dung server, ghi đè draft. Guard nullable
  role ở page/editor giữ lịch tải độc lập và modal báo đang tải quyền, chỉ nạp form/vault sau
  khi quyền đã rõ. Không đổi quyền API hay thứ tự vault/offline/detail. Regression giữ response
  quyền bằng barrier, kiểm lịch vẫn mở, không có input/detail sớm, rồi đúng một GET và PUT draft.
- **Thông báo:** nhãn hoạt động tách chữ `-200` từ cặp chip nền tối đặt lên mặt thẻ sáng;
  axe đo1,24:1 ở progress. Dùng mapping chữ `-300` cho bốn nhãn trên surface, giữ nguyên màu
  chip/icon và token global. Feed fixture có đủ4loại, assert nhãn/theme trước axe. RED hợp lệ:
  light fail desktop/mobile, darkblue pass cả hai; không giảm ngưỡng hay loại node.
- **Dashboard DnD:** test đọc KPI bằng request trước navigation rồi so với response browser
  khác thời điểm; worker song song có thể tạo/xoá sheet giữa hai snapshot. Oracle mới đọc chính
  response GET của navigation, thêm HTTP200; giữ nguyên10assertion cũ về số hàng, exact IDs,
  pending, rollback và retry. Không hardcode5hàng, không mock dashboard hoặc chạy serial để né race.

UI review dùng [ui-ux-craftsman](../../.agents/skills/ui-ux-craftsman/SKILL.md) cùng master/ADR0010.
Ba lượt review độc lập không phát hiện lỗi chặn trong phạm vi. Kết quả GREEN và full suite cuối
được ghi riêng trong verification, không nhập các lượt RED/setup thành pass.

## Kiểm chứng mới

Kết quả cuối được ghi ở [verification](evidence/technical-debt-2026-10/verification.md).
Raw logs nằm trong `.autopilot/hoan-thien-2026-10-26/` cục bộ, không commit credential,
cookie, tarball hoặc log lớn. Đây là kết quả nhánh, chưa phải mã đã merge/phát hành.

## Cổng tiếp theo

- [AI] Review/PR cho bản vá XSS và đối soát tài liệu; chờ người dùng cấp quyền merge/deploy
  theo AGENTS, không kế thừa quyền vận hành ghi trong log các phiên cũ.
- [Người dùng/operator] Duyệt scope M138 sau khi chốt topology/header contract; bổ sung
  bằng chứng mạng. Required checks đã có qua ruleset, không cần xin bật lại.
- [Người dùng] UAT người thật/thiết bị Safari/cảm ứng và nguồn/cửa sổ usage; test tự động
  không thay thế nghiệm thu hay xác nhận Product Complete.
