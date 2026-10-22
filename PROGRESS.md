# Tiến độ — 22/10/2026

## Đang làm

Không có lát nào dở. A2-AC10 lớp B (spec `e2e/authed/a2-ac10-diary-conflict.spec.ts` + vá `OfflineQueueBadge` giữ panel phục hồi) đã merge ở #668 `6690593`. CI/CodeQL/Lighthouse/Secret scan/Scorecard trên main xanh.

## Tiếp theo

- **Deploy to VPS đỏ** (run 39764210485): thiếu secret `VPS_SSH_KNOWN_HOSTS` — chặn fail-closed có chủ đích, không sửa bằng code. Chủ repo lấy host key qua console VPS (`ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub`), đối chiếu rồi dán dòng known_hosts vào secret (xem `DEPLOY.md`), sau đó chạy lại deploy.
- A2 còn mở: Safari/iOS thiết bị thật (cần người); ảnh mồ côi giữ P/H S06.
- Chọn lát S15 tiếp theo hoặc audit 1152 MUST/639 SHOULD.

## Quyết định

D-A2-001 tự duyệt lát B theo QUALITY-FINAL-1 Approved 25/09/2026. D-A2-002 (mức S): vá `OfflineQueueBadge` không mount lại màn phục hồi khi hàng đợi về 0 (RED trước vá ở `.autopilot/runtime/a2-run4.log`). #663 `2adda49d`, #664 `8fc15d89`, #665 `9c13f54a`, #666 `273a09d`, #668 `6690593` đã merge. A2/S15 giữ PARTIAL tổng thể.

## Bàn giao phiên

Mốc main: `6690593`. Loop một phiên (`docs/autopilot/A2-AC10-PLAN.md`), bằng chứng `.autopilot/evidence/T-00x.json`. Node 24 cục bộ qua `/root/.local/bin/node` (khớp CI; không sửa /opt/node22). Toàn 1152 MUST/639 SHOULD chưa audit; M/O/production/release giữ trạng thái cũ.
