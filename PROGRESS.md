# Tiến độ — 06/11/2026

## Đang làm

- **Audit D-009 đợt 2 — branch `claude/zen-lovelace-n3t0t7`**: spec e2e `finance-cash` (2 tab, `?tab=advances`, axe cả hai tab, desktop+mobile 7/7) cho trang tài chính `/finance/cash` chưa từng có spec (AUD-A11Y-001); khai `XBOSS_PG_ALLOW_EXIT_ON_IDLE` (`"0"|"1"`) trong schema `lib/nen/env.ts` (AUD-CFG-001). Cookie OIDC (AUD-SEC-001) để lại: dính TD-004 "chờ spec M49" — cần owner chốt.

- **Audit full 06/11 + đợt 1 — MERGED qua #711** `dd40b5b`: sổ `docs/ops/AUDIT-STATUS.md` + báo cáo `docs/ops/AUDIT-REPORT-2026-11-06.md` (0 🔴, 1 🟠 đã sửa, 16 🟢; 8/13 nhóm `chưa quét`); PROGRESS.md < 8 KB, `xt.yaml` khai `format_check`/`coverage`. Thumbnail ảnh hiện trường cùng PR.

## Tiếp theo

- Lịch sử các mục đã merge/deploy: `docs/ops/progress-history.md`. Bảng nợ kỹ thuật TD-xxx: `docs/ops/technical-debt-2026-10-26.md` (mục cuối). Phát hiện audit: `docs/ops/AUDIT-STATUS.md`.
- Audit D-009 đợt 2–4: axe `/finance/cash` + cookie OIDC + khai biến env; một nguồn màu trạng thái; quét sâu lại 8 nhóm `chưa quét`.
- M136: owner bố trí UAT 3–5 người và Safari/cảm ứng thật theo runbook; operator xác nhận nguồn/coverage/thời điểm thu usage trước pilot. PR đối soát và vá Zod **#676** đã merge/deploy; F4 VERIFIED; plan `docs/autopilot/M136-RELEASE-PLAN.md`; public smoke chưa chứng minh lỗi app mới; bản vá dependency phát sinh được ghi riêng ở trên.
- A2 còn mở: Safari/iOS thiết bị thật (cần người); ảnh mồ côi giữ P/H S06.
- Chọn lát S15 tiếp theo hoặc audit 1152 MUST/639 SHOULD.

## Quyết định

D-A2-001 tự duyệt lát B theo QUALITY-FINAL-1 Approved 25/09/2026. D-A2-002 (mức S): vá `OfflineQueueBadge` không mount lại màn phục hồi khi hàng đợi về 0 (RED trước vá ở `.autopilot/runtime/a2-run4.log`). #663 `2adda49d`, #664 `8fc15d89`, #665 `9c13f54a`, #666 `273a09d`, #668 `6690593` đã merge. A2/S15 giữ PARTIAL tổng thể.

Đã xong 23/10: **#673** `a7530e9` (M135 kéo thả nhóm/tầng + task trên lưới tracking, `@dnd-kit`, `PUT /api/workpackages` + `PUT /api/workpackages/:id/tasks`; test 14/14 + e2e kéo thật; chưa thử cảm ứng trên điện thoại thật). **#672** `8b043e1` (PROGRESS). **#667** `bbcfd43` (A1 API-key write hai org, test 7/7 Postgres). **#670** `1aef49f` (deploy đọc `VPS_SSH_KNOWN_HOSTS` từ variable; nâng `next`/`eslint-config-next` 16.4.2 vá advisory critical). **#671** `fb5075e` (deploy chuẩn hoá known_hosts — gắn nhãn host = `VPS_HOST`, khoá ghim giữ nguyên, fail-closed; `scripts/ops/chuan-hoa-known-hosts.sh`, test 11/11). **Deploy to VPS xanh lại**: run 39910066732 qua SSH + gửi build + deploy.sh. CodeQL `js/insufficient-password-hash` ở `hashApiKey` là báo sai (key 256 bit ngẫu nhiên) — nếu còn mở cần chủ repo dismiss.

## Bàn giao phiên

Mốc main đã đối soát ngày28/10: `4cf72488` (CI/deploy success); #675–#696 đã phát hành theo bằng chứng từng PR, không còn chờ CI #686. Owner giữ UAT/usage WAITING; chưa có nghiệm thu người thật hoặc cửa sổ usage. Goal tháng8 Product/Vision/Pinnacle đã ghi checkpoint đối soát, không dùng kết luận COMPLETE lịch sử cho sản phẩm hiện tại hay khôi phục module đã gỡ. QUALITY-FINAL-1/A1–A6 vẫn PARTIAL. Bản vá XSS/tài liệu đã merge qua #687 (`7805949`); M138 chưa approved. Runtime local Node24.22.1/Postgres16 disposable; không đổi production. Toàn1152 MUST/639 SHOULD chưa audit đầy đủ.
