# Tiến độ — 24/10/2026

## Đang làm

- **M136 — nâng cấp trải nghiệm và hiệu năng** (người dùng duyệt 23/10/2026): đã triển khai trên worktree từ `efd31ba0`, bảo toàn checkout gốc có 1.508 tệp xóa. Luồng lưu tracking/dashboard có lỗi/thử lại/rollback, keyboard nhóm, search mobile/menu thường dùng, header 360/393px, dọn copy lỗi thời, poll tab ẩn, kiểm kê chỉ đọc và dashboard tránh tính lặp/tải phụ độc lập. 18/18 cổng static và production build xanh; 25 unit + 4 DB mới, 45 browser mới xanh. Hồi quy shell/dashboard/role/tracking/offline, input mobile và kéo M135 đã qua; full release gate exit 0 (383 file, 5.152 pass, 0 fail, 1 skip đúng allowlist). Cùng fixture, dashboard API p95 giảm 329,60→232,49ms, bản tuần 259,20→129,31ms; hash không đổi. Mobile trang chủ vẫn khoảng 4,1s. Bằng chứng: `docs/ops/evidence/m136/verification.md`; spec/goal ở `docs/nang-cap/M136-trai-nghiem-hieu-nang-tinh-gon.md` và `docs/goals/upgrade-ux-performance-2026-10.md`. Đã merge **#675** tại `d413650c`, CI main xanh (5.160 pass, E2E 693 pass; số skip hiện hữu ghi trong evidence), deploy VPS và public smoke desktop/mobile 23–24/10 đạt. [Bằng chứng phát hành](docs/ops/evidence/m136/release.md). F1 rollout VERIFIED; F2 UAT người thật/thiết bị thực và F3 usage/quyết định capability còn WAITING. Không lấy ngày deploy làm ngày bắt đầu usage.

## Tiếp theo

- M136: owner bố trí UAT 3–5 người và Safari/cảm ứng thật theo runbook; operator xác nhận nguồn/coverage/thời điểm thu usage trước pilot. Plan đối soát `docs/autopilot/M136-RELEASE-PLAN.md`; không có lỗi code mới được chứng minh trong bước này.
- A2 còn mở: Safari/iOS thiết bị thật (cần người); ảnh mồ côi giữ P/H S06.
- Chọn lát S15 tiếp theo hoặc audit 1152 MUST/639 SHOULD.

## Quyết định

D-A2-001 tự duyệt lát B theo QUALITY-FINAL-1 Approved 25/09/2026. D-A2-002 (mức S): vá `OfflineQueueBadge` không mount lại màn phục hồi khi hàng đợi về 0 (RED trước vá ở `.autopilot/runtime/a2-run4.log`). #663 `2adda49d`, #664 `8fc15d89`, #665 `9c13f54a`, #666 `273a09d`, #668 `6690593` đã merge. A2/S15 giữ PARTIAL tổng thể.

Đã xong 23/10: **#673** `a7530e9` (M135 kéo thả nhóm/tầng + task trên lưới tracking, `@dnd-kit`, `PUT /api/workpackages` + `PUT /api/workpackages/:id/tasks`; test 14/14 + e2e kéo thật; chưa thử cảm ứng trên điện thoại thật). **#672** `8b043e1` (PROGRESS). **#667** `bbcfd43` (A1 API-key write hai org, test 7/7 Postgres). **#670** `1aef49f` (deploy đọc `VPS_SSH_KNOWN_HOSTS` từ variable; nâng `next`/`eslint-config-next` 16.4.2 vá advisory critical). **#671** `fb5075e` (deploy chuẩn hoá known_hosts — gắn nhãn host = `VPS_HOST`, khoá ghim giữ nguyên, fail-closed; `scripts/ops/chuan-hoa-known-hosts.sh`, test 11/11). **Deploy to VPS xanh lại**: run 39910066732 qua SSH + gửi build + deploy.sh. CodeQL `js/insufficient-password-hash` ở `hashApiKey` là báo sai (key 256 bit ngẫu nhiên) — nếu còn mở cần chủ repo dismiss.

## Bàn giao phiên

Mốc main đã đối soát: `d413650c`. M136 đã phát hành; vòng hiện tại lưu bằng chứng và giữ UAT/usage chờ người. Loop đối soát (`docs/autopilot/M136-RELEASE-PLAN.md`) trên nhánh `codex/m136-release-reconciliation`; evidence phát hành đã lưu ở `docs/ops/evidence/m136/release.json`. Node 24 qua `/home/liend/.local/opt/node-v24.21.0/bin`; không đổi hệ thống hoặc lockfile. Toàn 1152 MUST/639 SHOULD chưa audit; M/O/production/release giữ trạng thái cũ.
