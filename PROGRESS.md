# Tiến độ — 07/11/2026

## Đang làm

- **Audit D-009 đợt 4d — branch `claude/zen-lovelace-n3t0t7`** (PR #718): 🟢 SEC-013 — /api/project lộ tên tháp dự án khác (đã vá, test đỏ-trước), DELETE NCC/PO trả 401 khi chưa đăng nhập, NCC + BOQ export kiểm qua `CAN`; 🟢 CI-003 — bước npm audit dev thử lại thay vì nuốt mã thoát.

- **Audit D-009 đợt 4c — MERGED qua #716** `6534d02`: 🟢 SEC-012 — /api/schedule-control che `delayNote` với thầu phụ (giữ thiết kế xem đường găng); 🟢 CODE-005 phần lưu trữ — 18 route dọn file lỗi qua `storageDeleteBestEffort` (ghi log, không nuốt im lặng). Còn 🟢 mở: xem sổ `docs/ops/AUDIT-STATUS.md`.

- **Audit D-009 đợt 4b — MERGED qua #715** `a0dad71`: vá 14 🟠 kèm test đỏ-trước — NCR chặn vai trò chỉ-xem/khoá NCR đóng/kiểm tham chiếu (SEC-004/005); materials POST + import chỉ nhận sheet của dự án (SEC-006, SEC-014); user-projects PUT chỉ xoá trong phạm vi (SEC-007); presence lọc org (SEC-008); BOQ che đơn giá theo viewPayments (SEC-009); cron GET bằng phiên cần quyền ghi + chặn điều hướng khác site (SEC-010); quét bản vẽ không gắn rev chéo dự án, rev tự duyệt chỉ Admin/PM (SEC-011); upload tracking không hạ nghiem_thu + lỗi hệ thống không thành 400 (CODE-003/004); gỡ chu trình lib, cổng bắt dynamic import (ARCH-001); test materials/import + reports (TEST-001). Còn 🟠 duy nhất: CI-002 — owner tạo environment `production` có người duyệt trong Settings, chuyển secret VPS vào đó.

- **Audit D-009 đợt 4 — MERGED qua #713** `f036768`: 3 🔴 (payroll/:id lộ lương, YCNT bỏ kiểm dự án khi null, deploy chạy cho PR từ fork) + 3 🟢. #710 (khung 3.31.0) merged `163625b`.

- **Audit D-009 đợt 2–3 — MERGED qua #712** `2978a61` — owner giao "theo phương án chất lượng" 07/11: D-011 màu trạng thái một nguồn `STATUS_CLS`/`STATUS_BAR`/`STATUS_TEXT` trong `app/components/StatusBadge.tsx` (trễ = cam, /my-tasks hết đỏ, đang thi công thống nhất blue), test `status-mau-thong-nhat` khoá cùng sắc độ; D-012 compose lại BLUEPRINT theo khung 3.30.1 (1170 MUST/741 SHOULD, 0 tick — đối soát ở đợt 4); D-010 giữ cookie OIDC theo spec M49, AUD-SEC-001 `chấp nhận` tới M138 (hạn 31/12).

- **Đợt 2 (#712)**: spec e2e `finance-cash` (2 tab, `?tab=advances`, axe cả hai tab, desktop+mobile 7/7) cho trang tài chính `/finance/cash` chưa từng có spec (AUD-A11Y-001); khai `XBOSS_PG_ALLOW_EXIT_ON_IDLE` (`"0"|"1"`) trong schema `lib/nen/env.ts` (AUD-CFG-001). Cookie OIDC (AUD-SEC-001) để lại: dính TD-004 "chờ spec M49" — cần owner chốt.

- **Audit full 06/11 + đợt 1 — MERGED qua #711** `dd40b5b`: sổ `docs/ops/AUDIT-STATUS.md` + báo cáo `docs/ops/AUDIT-REPORT-2026-11-06.md` (0 🔴, 1 🟠 đã sửa, 16 🟢; 8/13 nhóm `chưa quét`); PROGRESS.md < 8 KB, `xt.yaml` khai `format_check`/`coverage`. Thumbnail ảnh hiện trường cùng PR.

## Tiếp theo

- Lịch sử các mục đã merge/deploy: `docs/ops/progress-history.md`. Bảng nợ kỹ thuật TD-xxx: `docs/ops/technical-debt-2026-10-26.md` (mục cuối). Phát hiện audit: `docs/ops/AUDIT-STATUS.md`.
- Audit D-009 đợt 4: quét sâu lại 8 nhóm `chưa quét` (đọc từng route theo `docs/audit.md` §3/§8) + đối soát 1170 MUST blueprint.
- M136: owner bố trí UAT 3–5 người và Safari/cảm ứng thật theo runbook; operator xác nhận nguồn/coverage/thời điểm thu usage trước pilot. PR đối soát và vá Zod **#676** đã merge/deploy; F4 VERIFIED; plan `docs/autopilot/M136-RELEASE-PLAN.md`; public smoke chưa chứng minh lỗi app mới; bản vá dependency phát sinh được ghi riêng ở trên.
- A2 còn mở: Safari/iOS thiết bị thật (cần người); ảnh mồ côi giữ P/H S06.
- Chọn lát S15 tiếp theo hoặc audit 1152 MUST/639 SHOULD.

## Quyết định

D-A2-001 tự duyệt lát B theo QUALITY-FINAL-1 Approved 25/09/2026. D-A2-002 (mức S): vá `OfflineQueueBadge` không mount lại màn phục hồi khi hàng đợi về 0 (RED trước vá ở `.autopilot/runtime/a2-run4.log`). #663 `2adda49d`, #664 `8fc15d89`, #665 `9c13f54a`, #666 `273a09d`, #668 `6690593` đã merge. A2/S15 giữ PARTIAL tổng thể.

Đã xong 23/10: **#673** `a7530e9` (M135 kéo thả nhóm/tầng + task trên lưới tracking, `@dnd-kit`, `PUT /api/workpackages` + `PUT /api/workpackages/:id/tasks`; test 14/14 + e2e kéo thật; chưa thử cảm ứng trên điện thoại thật). **#672** `8b043e1` (PROGRESS). **#667** `bbcfd43` (A1 API-key write hai org, test 7/7 Postgres). **#670** `1aef49f` (deploy đọc `VPS_SSH_KNOWN_HOSTS` từ variable; nâng `next`/`eslint-config-next` 16.4.2 vá advisory critical). **#671** `fb5075e` (deploy chuẩn hoá known_hosts — gắn nhãn host = `VPS_HOST`, khoá ghim giữ nguyên, fail-closed; `scripts/ops/chuan-hoa-known-hosts.sh`, test 11/11). **Deploy to VPS xanh lại**: run 39910066732 qua SSH + gửi build + deploy.sh. CodeQL `js/insufficient-password-hash` ở `hashApiKey` là báo sai (key 256 bit ngẫu nhiên) — nếu còn mở cần chủ repo dismiss.

## Bàn giao phiên

Mốc main đã đối soát ngày28/10: `4cf72488` (CI/deploy success); #675–#696 đã phát hành theo bằng chứng từng PR, không còn chờ CI #686. Owner giữ UAT/usage WAITING; chưa có nghiệm thu người thật hoặc cửa sổ usage. Goal tháng8 Product/Vision/Pinnacle đã ghi checkpoint đối soát, không dùng kết luận COMPLETE lịch sử cho sản phẩm hiện tại hay khôi phục module đã gỡ. QUALITY-FINAL-1/A1–A6 vẫn PARTIAL. Bản vá XSS/tài liệu đã merge qua #687 (`7805949`); M138 chưa approved. Runtime local Node24.22.1/Postgres16 disposable; không đổi production. Toàn1152 MUST/639 SHOULD chưa audit đầy đủ.
