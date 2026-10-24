# Tiến độ — 24/10/2026

## Đang làm

- **UI phục hồi và tải chính độc lập — CODE VERIFIED** từ main `6a6bc0bd`, theo yêu cầu tiếp tục rà production ngày 24/10: sửa lỗi/empty/retry và pending trên chi tiết mặt bằng, thông báo, ảnh/album, nhật ký và báo cáo. Giữ draft, chặn phản hồi bộ lọc cũ; forecast không tải lặp theo bộ lọc. Browser RED có trước sửa; build cuối/gate 18/18 đạt. Full local unit 5.165 pass/0 fail/1 skip allowlist; 85 ca browser mới (84 hành vi + setup) và 121 hồi quy (120 hành vi + setup), 0 fail/flaky/skip. Cùng fixture suppliers trễ 3s: công tác ready 3031,6→60,1ms desktop/3026,1→53,4ms mobile; normal tăng 15–20ms trong mẫu nhỏ, không kết luận CWV. Forecast 5→1 và systems 4→1 GET trong bài thử 5 lựa chọn. PR #680: CI đầu bắt lỗi trùng thông báo offline; sửa một dòng giữ lỗi inline, không đổi test cũ. Build/format/lint mới và 33/33 hồi quy nhật ký/offline đạt; bổ sung 360px 10/10 đạt. CI/phát hành chờ HEAD cuối của PR. UAT/usage vẫn WAITING; không bỏ capability. [Bằng chứng](docs/ops/evidence/ui-recovery-2026-10/verification.md).

- **UI tin cậy và đơn giản hóa — DEPLOYED #679**: main `6a6bc0bd`; CI main 40059853915 đạt (5.173 unit pass/0 fail/1 skip allowlist; E2E 785 pass/0 flaky/51 skip cũ; mutation 52/52). Deploy 40060604278 success cùng SHA lúc 11:04:29 UTC+7 ngày 24/10; public smoke desktop/mobile chỉ đọc đạt. Form hạng mục/nhãn/mặt bằng giữ draft, metadata HSE/Risks dùng chung và index ô ma trận. [Release](docs/ops/evidence/ui-quality-2026-10/release.json).

- **PR #678 — vá dependency**: đã squash merge tại `079e79ef` từ `caf010ec`. Nodemailer 10.0.14→10.1.4 và fast-uri dev-only 4.2.1→4.2.3; audit toàn bộ 0 vulnerability, không thêm direct dependency/đổi API/SMTP/quyền. CI PR 40057066123: 384 file/5.166 unit pass/0 fail/1 skip allowlist; 743 E2E pass/0 flaky/51 skip cũ, coverage đạt. CI main 40057819385 (5.166 unit/743 E2E pass, 0 flaky) và deploy 40058602986 success cùng SHA; public smoke sau deploy đạt. [Bằng chứng](docs/ops/evidence/nodemailer-2026-10/verification.md).

- **M137 — UI/hiệu năng tiếp theo**: DEPLOYED qua **#677**, main `6b631f15`; CI 40055784430 và deploy 40056412712 success cùng SHA, public smoke desktop/mobile chỉ đọc đạt. Tải việc hiện trường độc lập nguồn phụ (lab trễ 3s: median 5,95→3,36s, normal gần như không đổi); tạo trang giữ input/chặn gửi lặp; modal/focus/scroll, nhãn mobile và tương phản đã kiểm. Pin riêng Undici 8.12.2 vá high. [Release](docs/ops/evidence/m137/release.md) ghi riêng 1 flaky qua retry/51 skip E2E cũ và giới hạn. F2/F3 vẫn WAITING, không xóa capability.

- **M136 — trải nghiệm và hiệu năng**: DEPLOYED qua **#675** `d413650c`; CI/deploy cùng SHA và public smoke 23–24/10 đạt. Lưu tracking/dashboard có retry/rollback, keyboard, search/nav mobile, poll tab ẩn, kiểm kê chỉ đọc và dashboard tải nguồn phụ độc lập. Local full unit 5.152 pass/0 fail/1 skip allowlist; gate 18/18, build và hồi quy đạt. Cùng fixture: dashboard API p95 329,60→232,49ms, bản tuần 259,20→129,31ms; response hash khớp. [Verification](docs/ops/evidence/m136/verification.md), [release](docs/ops/evidence/m136/release.md), goal `docs/goals/upgrade-ux-performance-2026-10.md`. Checkout gốc giữ nguyên 1.508 tệp xóa. UAT/usage theo owner vẫn chờ; không coi ngày deploy là ngày bắt đầu đo.

- **Bổ sung PR #676 — vá Zod**: CI phát hiện GHSA-mrhx-c7xc-m3w5 high trên lock 4.6.5; D-002 theo `/autopilot` nâng riêng Zod lên 4.6.6, giữ schema/auth/CI. Audit production 0 vulnerability, env 11/11, engineering DB 55/55 (0 skip) và build mới đạt; gate 18/18 đạt. Đã merge theo duyệt rõ của owner tại `9afb984d`, CI main 40039658290 xanh (5.160 pass, E2E 693 pass) và deploy 40040711272 thành công lúc 06:41 ngày 24/10 UTC+7; public smoke sau deploy đạt; F4 VERIFIED; [hồ sơ](docs/ops/evidence/m136/zod-repair.md).

## Tiếp theo

- M136: owner bố trí UAT 3–5 người và Safari/cảm ứng thật theo runbook; operator xác nhận nguồn/coverage/thời điểm thu usage trước pilot. PR đối soát và vá Zod **#676** đã merge/deploy; F4 VERIFIED; plan `docs/autopilot/M136-RELEASE-PLAN.md`; public smoke chưa chứng minh lỗi app mới; bản vá dependency phát sinh được ghi riêng ở trên.
- A2 còn mở: Safari/iOS thiết bị thật (cần người); ảnh mồ côi giữ P/H S06.
- Chọn lát S15 tiếp theo hoặc audit 1152 MUST/639 SHOULD.

## Quyết định

D-A2-001 tự duyệt lát B theo QUALITY-FINAL-1 Approved 25/09/2026. D-A2-002 (mức S): vá `OfflineQueueBadge` không mount lại màn phục hồi khi hàng đợi về 0 (RED trước vá ở `.autopilot/runtime/a2-run4.log`). #663 `2adda49d`, #664 `8fc15d89`, #665 `9c13f54a`, #666 `273a09d`, #668 `6690593` đã merge. A2/S15 giữ PARTIAL tổng thể.

Đã xong 23/10: **#673** `a7530e9` (M135 kéo thả nhóm/tầng + task trên lưới tracking, `@dnd-kit`, `PUT /api/workpackages` + `PUT /api/workpackages/:id/tasks`; test 14/14 + e2e kéo thật; chưa thử cảm ứng trên điện thoại thật). **#672** `8b043e1` (PROGRESS). **#667** `bbcfd43` (A1 API-key write hai org, test 7/7 Postgres). **#670** `1aef49f` (deploy đọc `VPS_SSH_KNOWN_HOSTS` từ variable; nâng `next`/`eslint-config-next` 16.4.2 vá advisory critical). **#671** `fb5075e` (deploy chuẩn hoá known_hosts — gắn nhãn host = `VPS_HOST`, khoá ghim giữ nguyên, fail-closed; `scripts/ops/chuan-hoa-known-hosts.sh`, test 11/11). **Deploy to VPS xanh lại**: run 39910066732 qua SSH + gửi build + deploy.sh. CodeQL `js/insufficient-password-hash` ở `hashApiKey` là báo sai (key 256 bit ngẫu nhiên) — nếu còn mở cần chủ repo dismiss.

## Bàn giao phiên

Mốc main đã đối soát: `6a6bc0bd`. M136 và Zod 4.6.6 đã phát hành qua #675/#676. Owner xác nhận “Chưa có; giữ hai mục này chờ” cho UAT/usage; sau đó duyệt triển khai kỹ thuật M137 trên nhánh `codex/m137-ui-performance`. Evidence M136 ở `docs/ops/evidence/m136/release.json`, kết quả F4 cuối ở PR #676. M137 đã phát hành qua #677; #678 đã merge/deploy và public smoke đạt. Lát UI #679 đã phát hành; lát phục hồi UI kế tiếp đang kiểm, evidence `docs/ops/evidence/ui-recovery-2026-10/verification.md`. Runtime kiểm local mới `/home/liend/.local/opt/node-v24.22.1/bin`, chưa xác minh patch VPS; M137-R1 chỉ pin Undici 8.12.2, không đổi gói khác. Toàn 1152 MUST/639 SHOULD chưa audit; M/O/production/release giữ trạng thái cũ.
