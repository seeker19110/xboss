# Tiến độ — 23/10/2026

## Đang làm

- **M135 kéo thả sắp xếp tracking** (`docs/nang-cap/M135-keo-tha-sap-xep-tracking.md`): kéo nhóm (tầng) trong
  sheet + task trong nhóm, chỉ Admin/PM ở chế độ sửa, tắt khi đang lọc; `lib/tien-do/sap-xep.ts`, `PUT
/api/workpackages`, `PUT /api/workpackages/:id/tasks`, `KeoTha.tsx`; test `tests/sap-xep-tracking.test.ts`
  14/14 + e2e kéo thật. PR #673 đang mở.

## Tiếp theo

- A2 còn mở: Safari/iOS thiết bị thật (cần người); ảnh mồ côi giữ P/H S06.
- Chọn lát S15 tiếp theo hoặc audit 1152 MUST/639 SHOULD.

## Quyết định

D-A2-001 tự duyệt lát B theo QUALITY-FINAL-1 Approved 25/09/2026. D-A2-002 (mức S): vá `OfflineQueueBadge` không mount lại màn phục hồi khi hàng đợi về 0 (RED trước vá ở `.autopilot/runtime/a2-run4.log`). #663 `2adda49d`, #664 `8fc15d89`, #665 `9c13f54a`, #666 `273a09d`, #668 `6690593` đã merge. A2/S15 giữ PARTIAL tổng thể.

Đã xong 23/10: **#667** `bbcfd43` (A1 API-key write hai org, test 7/7 Postgres). **#670** `1aef49f` (deploy đọc `VPS_SSH_KNOWN_HOSTS` từ variable; nâng `next`/`eslint-config-next` 16.4.2 vá advisory critical). **#671** `fb5075e` (deploy chuẩn hoá known_hosts — gắn nhãn host = `VPS_HOST`, khoá ghim giữ nguyên, fail-closed; `scripts/ops/chuan-hoa-known-hosts.sh`, test 11/11). **Deploy to VPS xanh lại**: run 39910066732 qua SSH + gửi build + deploy.sh. CodeQL `js/insufficient-password-hash` ở `hashApiKey` là báo sai (key 256 bit ngẫu nhiên) — nếu còn mở cần chủ repo dismiss.

## Bàn giao phiên

Mốc main: `fb5075e`. Loop một phiên (`docs/autopilot/A2-AC10-PLAN.md`), bằng chứng `.autopilot/evidence/T-00x.json`. Node 24 cục bộ qua `/root/.local/bin/node` (khớp CI; không sửa /opt/node22). Toàn 1152 MUST/639 SHOULD chưa audit; M/O/production/release giữ trạng thái cũ.
