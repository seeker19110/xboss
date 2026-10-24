# Nâng cấp trải nghiệm, hiệu năng và tinh gọn XBoss

| Thuộc tính            | Giá trị                                                                                                     |
| --------------------- | ----------------------------------------------------------------------------------------------------------- |
| Goal ID               | UPGRADE-2026-10                                                                                             |
| Owner                 | Chủ dự án                                                                                                   |
| State                 | WAITING — M137 DEPLOYED; #678 DEPLOYED; UI #679 DEPLOYED; vòng phục hồi UI CODE VERIFIED; UAT/usage WAITING |
| Main SHA đã reconcile | `6a6bc0bd32a4efc652d2f31e979e1e9ba57bbe37`                                                                  |
| Bắt đầu               | 2026-10-23                                                                                                  |
| Đối soát              | 2026-10-24                                                                                                  |
| Spec                  | M136 — Approved for implementation, người dùng duyệt trong chat 23/10/2026                                  |

## Outcome và cổng hoàn thành

Hoàn thiện các luồng lưu khi mạng yếu, điều hướng mobile, dashboard và công cụ đo theo kế hoạch nâng cấp được duyệt. Bằng chứng kỹ thuật: test lỗi mạng/retry/keyboard/role, query count và hiệu năng trên cùng fixture, kiểm thử DB biệt lập, build và các cổng cần thiết. Phần sản phẩm: UAT 3–5 người, cửa sổ usage phù hợp trước bỏ capability và đo người dùng thật.

## Milestone

| ID  | Outcome                                      | State    | Evidence                                                    |
| --- | -------------------------------------------- | -------- | ----------------------------------------------------------- |
| A   | Lưu tin cậy, keyboard tracking               | VERIFIED | Browser lỗi/retry/keyboard/rollback, giữ kéo M135           |
| B   | Điều hướng mobile và nội dung đúng           | VERIFIED | Search/nav/role/flags, focus, axe và 360/393px              |
| C   | Poll có giới hạn, kiểm kê chỉ đọc đúng       | VERIFIED | Unit, browser visibility, 4 ca PostgreSQL thật              |
| D   | Dashboard tránh tính lặp, tải chính trước    | VERIFIED | Call-count, nguồn phụ độc lập, hash API khớp                |
| E   | Bằng chứng regression/performance và runbook | VERIFIED | Gate, build, test và benchmark trong verification           |
| F1  | Phát hành production và public smoke         | VERIFIED | PR #675, CI/deploy cùng SHA, release.md và release.json     |
| F2  | UAT 3–5 người, Safari/cảm ứng thật           | WAITING  | Chưa có người/thiết bị và kết quả nghiệm thu                |
| F3  | Usage và quyết định giữ/gộp/gỡ capability    | WAITING  | Chưa xác nhận nguồn/coverage/thời điểm thu và cửa sổ đủ dài |
| F4  | Vá Zod mới phát hiện trong CI và phát hành   | VERIFIED | PR #676, CI/deploy đúng `9afb984d`, public smoke đạt        |
| G   | Tải việc hiện trường và tạo trang tin cậy    | VERIFIED | PR #677; CI/deploy đúng 6b631f15, public smoke đạt          |

## Current truth

[PR #679](https://github.com/seeker19110/xboss/pull/679) đã squash merge thành main
`6a6bc0bd32a4efc652d2f31e979e1e9ba57bbe37`. CI main 40059853915 và deploy 40060604278
success cùng SHA; public smoke 04:04:41Z ngày 24/10 đạt. 5.173 unit/785 E2E pass,
0 flaky, 1 unit skip allowlist/51 E2E skip cũ; mutation 52/52 runnable, 0 survivor.
[Release cuối](../ops/evidence/ui-quality-2026-10/release.json) đối soát checkpoint iteration 5.

[PR #677](https://github.com/seeker19110/xboss/pull/677) đã merge thành main `6b631f15`,
CI main 40055784430 và deploy 40056412712 success cùng SHA ngày 24/10; public smoke
desktop/mobile chỉ đọc đạt. G VERIFIED; [release và giới hạn](../ops/evidence/m137/release.md).

[PR #675](https://github.com/seeker19110/xboss/pull/675) đã merge thành main `d413650c`.
[CI main](https://github.com/seeker19110/xboss/actions/runs/39963366086) và
[deploy](https://github.com/seeker19110/xboss/actions/runs/39964822526) thành công trên cùng SHA.
Public smoke desktop/mobile ngày 23/10, kiểm lại 24/10 đều PASS; health/readiness tốt.
Bằng chứng và giới hạn: [release.md](../ops/evidence/m136/release.md),
[release.json](../ops/evidence/m136/release.json). Không thử ghi dữ liệu production.

[PR #676](https://github.com/seeker19110/xboss/pull/676) đã squash merge thành main
`9afb984d`, pin Zod 4.6.6. [CI main](https://github.com/seeker19110/xboss/actions/runs/40039658290)
và [deploy](https://github.com/seeker19110/xboss/actions/runs/40040711272) thành công trên
cùng SHA; deploy xác nhận Node 24/PM2/health-check, hoàn tất 06:41:16 ngày 24/10 UTC+7.
Public smoke sau deploy đạt desktop/mobile login, JS/CSS, axe, API bảo vệ, health/readiness;
chỉ đọc, không đăng nhập hoặc ghi dữ liệu production. F4 VERIFIED; kết quả cuối ở PR.

Checkout gốc tại `/mnt/c/Users/liend/xboss` giữ nguyên 1.508 tệp xóa từ trước. Benchmark vẫn
so baseline `efd31ba0` với candidate M136 trên cùng fixture: dashboard p95 giảm khoảng 29%,
bản tuần khoảng 50%; ba response hash khớp. Mobile trang chủ khoảng 4,1 giây tới dữ liệu chính;
chưa chứng minh đạt Core Web Vitals ngoài thực địa.
[Bằng chứng lab](../ops/evidence/m136/verification.md).

## Iteration 1 — 2026-10-23

- A–E có bằng chứng kỹ thuật theo contract M136; chủ dự án duyệt commit/push/deploy.
- Local: 18/18 gate, build, full release gate 5.152 pass/0 fail/1 skip allowlist;
  25 unit + 4 DB mới, 45 E2E mới và các hồi quy liên quan đã qua.
- CI main là lượt khác: 5.160 pass/0 fail/1 skip allowlist; E2E 693 pass/51 skip điều kiện
  có sẵn, mutation 52/52 runnable/0 survivor. Không gộp hai bộ số local/CI.
- Production đã phát hành 20:57 UTC+7 ngày 23/10; F1 VERIFIED, F2–F3 còn chờ.

## Iteration 2 — 2026-10-24

- Đối soát main/GitHub/production, lưu evidence phát hành vào repo và sửa trạng thái rollout.
- Không tìm thấy lỗi app mới từ public smoke. CI sau đó phát hiện dependency Zod high:
  D-002 bổ sung riêng bản vá 4.6.5→4.6.6 trong #676, không mở capability hoặc nới gate.
  [Hồ sơ và giới hạn](../ops/evidence/m136/zod-repair.md) giữ checkpoint trước merge;
  bản vá sau đó đã qua CI, merge/deploy và kiểm chứng F4 như Current truth.
- Plan: [M136-RELEASE-PLAN.md](../autopilot/M136-RELEASE-PLAN.md); T-006 merge #676 đã
  được người dùng duyệt rõ và hoàn thành. Owner xác nhận “Chưa có; giữ hai mục này chờ”
  ngày 24/10, áp dụng cho F2 UAT và F3 usage, không miễn trừ tiêu chí.
- F2: owner bố trí 3–5 người đại diện theo bảng tác vụ trong runbook, gồm thiết bị Safari/
  cảm ứng thật; ghi thời gian, trợ giúp, lỗi và kết luận. Không thay người thật bằng agent.
- F3: owner/operator xác nhận nguồn, scope và coverage đo trước pilot; ghi ngày bắt đầu thu
  thực, theo đủ chu kỳ nghiệp vụ rồi quyết định giữ/gộp/gỡ. Ngày deploy chưa phải ngày bắt đầu đo.
- Không xóa capability sống hoặc dữ liệu thật trước khi có usage/caller/hồ sơ và owner quyết định.

## Iteration 3 — 2026-10-24

Người dùng yêu cầu triển khai tiếp cải tiến UI/hiệu năng không phụ thuộc UAT/usage.
[M137](../nang-cap/M137-ui-hieu-nang-tiep-theo.md) sửa form Thêm trang thiếu guard/catch/label,
trang Hiện trường chờ ba nguồn phụ mới hiện việc chính, modal lồng nhau/focus/scroll,
nhãn mobile tràn/cắt và tương phản chuyển theme trong tìm kiếm. Không mở capability,
xóa module, đổi schema/auth hoặc triển khai telemetry.

CODE VERIFIED local: browser RED/GREEN, 50 ca mới đạt; tổng hồi quy 128 pass/0 fail/
1 skip nền tảng có sẵn; gate 18/18, build, full unit 383 file/5.152 pass/0 fail/1 skip
đúng allowlist. Cùng fixture ba việc và 40 hash khớp: nguồn phụ trễ 3s, median ready
5,95→3,36s; normal gần như không đổi. [Bằng chứng và giới hạn](../ops/evidence/m137/verification.md).
PR #677 bổ sung [M137-R1](../ops/evidence/m137/undici-repair.md): pin riêng Undici có sẵn
8.10.2→8.12.2 để sửa audit high; 21 ca webhook/SSRF và build mới đạt, audit còn một
package moderate có sẵn, 0 high/critical.
Checkpoint trước release: chờ CI/rollout. Sau duyệt rõ ngày 24/10, #677 đã merge,
CI/deploy cùng SHA và public smoke đạt như Current truth; G VERIFIED. F2/F3 tiếp tục chờ.

## Iteration 4 — 2026-10-24

Owner duyệt #677 và giao tiếp: “rồi làm tất cả các việc còn lại bạn có thể quyết,
ưu tiên chất lượng, đơn giản hoá”. Lát S ưu tiên: pin riêng Nodemailer 10.1.4 vá ba
advisory moderate, không đổi route/SMTP/auth. Local RED 3 PoC, GREEN 6 ca; audit 0 vulnerability,
gate/build/full unit đạt, xem [bằng chứng](../ops/evidence/nodemailer-2026-10/verification.md).
PR #678 bổ sung transitive dev-only fast-uri 4.2.1→4.2.3: full audit 0 vulnerability;
gate cuối 18/18. CI PR 40057066123 trên caf010ec success (5.166 unit, 743 E2E, 0 flaky); đã merge
#678 tại `079e79ef`. CI main 40057819385 và deploy 40058602986 success cùng SHA; public smoke sau deploy
đạt desktop/mobile và health/readiness. [Release](../ops/evidence/nodemailer-2026-10/release.json).

Lát S kế tiếp Ready từ audit source: form tạo hạng mục chống Enter lặp; sửa nhãn chỉ
commit sau lưu thật; mặt bằng phân biệt lỗi/empty, retry và giữ bản nhập; gom danh mục
HSE/Risks thuần client/server. Giữ API/quyền/capability. Chỉ kết luận xong sau browser,
gate/build/test và phát hành. Không lấy cleanup nội bộ làm quyết định bỏ tính năng.

## Iteration 5 — 2026-10-24

Lát S UI từ main `079e79ef`: [PR #679](https://github.com/seeker19110/xboss/pull/679), implementation đã tích hợp trên nhánh
`codex/ui-reliability-followup`; form/nhãn/mặt bằng giữ draft/error/retry, dùng chung
metadata HSE/Risks và index ô ma trận. Guard quyền/API/schema giữ nguyên.
Build, 7 unit index và 38 ca browser mới + setup đạt 39 pass/0 fail/skip; full release
gate đạt 385 file/5.165 pass/0 fail/1 skip allowlist trên checkpoint `f83a1fe9`. Hồi quy
phát hiện tên hộp thoại chứa cả tên nút sửa sau tải admin; sửa semantics và giữ
nguyên assertion cũ. Build mới/gate 18/18 và nhóm browser kết hợp 134 pass/0 fail/
1 skip M135 mobile có sẵn đạt; 42 ca hành vi mới nằm trong nhóm này. RED mất mạng kép trên checkpoint `f370190e` và trace một GET auth/hai GET matrix
đã có trước sửa catch; GREEN cả desktop/mobile. [Bằng chứng](../ops/evidence/ui-quality-2026-10/verification.md).

Microbench synthetic 3200 rows: lookup find 13,71→index gồm build 0,12ms, checksum/object
identity khớp; không suy ra DOM/CWV hay tốc độ trang thật. Toàn goal tiếp tục WAITING
F2/F3; không xóa capability. Đây là checkpoint trước merge; bằng chứng CI/merge SHA/
deploy/public smoke cuối nằm ở mục **Kết quả phát hành** trong PR #679.
Chỉ tính DEPLOYED khi mục đó xác nhận đủ bằng chứng cùng SHA.

## Iteration 6 — 2026-10-24

Owner tiếp tục giao rà production, tự triển khai UI/hiệu năng, ưu tiên chất lượng và đơn giản hóa;
F2/F3 giữ chờ. Public smoke chỉ đọc trước sửa đạt (login/JS/CSS/axe/health/readiness),
không dùng phiên hay dữ liệu production. Source cùng main phát hiện loading/error thành empty,
form còn sửa/đóng khi mutation chờ và response bộ lọc cũ ghi đè lựa chọn mới.

Lát CODE VERIFIED local: chi tiết tầng tải chính độc lập suppliers/giữ draft+tài liệu retry;
thông báo có retry/mark-all guard; nhãn lỗi GET không khóa cache; album/ảnh và nhật ký giữ
pending/error; báo cáo giữ đúng system/range/days, forecast độc lập không fetch lặp.
Giữ API/payload/quyền/precondition nhật ký/offline/export, không schema/dependency/telemetry mới.
RED baseline và benchmark synthetic cùng fixture có trước sửa; [verification](../ops/evidence/ui-recovery-2026-10/verification.md)
ghi GREEN 85/85 mới + 121/121 hồi quy (mỗi lượt gồm setup), gate18/18, build và full unit5.165pass/0fail/1skip allowlist. Benchmark/request-count cùng fixture và hình thức đã kiểm. PR #680 bắt lỗi trùng lỗi inline/toast offline trong CI đầu; sửa251ec883 giữ một thông báo trong form, không đổi oracle cũ. Build/lint/format và33/33 offline/nhật ký sau sửa đạt,360px10/10 đạt. Kết quả CI/phát hành cuối theo PR của lát này; không coi technical fixes là UAT/usage.

## Final audit

- [x] A–E có test và bằng chứng kỹ thuật.
- [x] Cổng repo và E2E liên quan đạt trên bản M136.
- [x] Regression quyền/scope/tiền/tiến độ/offline/kéo thả đã qua các cổng; giữ export/in.
- [x] Rollout F1 được kiểm chứng; kết quả và giới hạn được lưu trong repo.
- [ ] F2 có UAT người thật và thiết bị thực.
- [ ] F3 có cửa sổ usage phù hợp và quyết định owner về capability.
- [x] F4 bản vá Zod qua CI, được merge/phát hành và kiểm chứng.
- [x] G/M137 có bằng chứng kỹ thuật và phát hành tương ứng.

**Kết luận:** M136 và bản vá Zod CODE VERIFIED, DEPLOYED; toàn mục tiêu NOT COMPLETE vì
F2/F3 đang chờ theo quyết định owner. M137 DEPLOYED; các lát S mới phải có bằng chứng riêng.
