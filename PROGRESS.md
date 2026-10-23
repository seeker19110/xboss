# Tiến độ — 22/10/2026

## Đang làm

- **PR #667** (A1 API-key write hai org, nhánh `codex/autopilot-a1-api-key-write`, test/docs): test mới `tests/a1-api-key-write-org.test.ts` 7/7 pass trên Postgres. CI đỏ vì `docs/nang-cap/AUDIT-2026-09-25/S00-SCOPE-INVENTORY.md` (file sinh) chưa cập nhật cột Test cho route `engineering/agent-sessions` → đã chạy lại `npm run audit:route-scope`; merge `main` (#668–#670) vào nhánh, gộp checkpoint S15 thành §13 (A2-AC10) + §14 (A1 key write). CodeQL báo `js/insufficient-password-hash` ở `hashApiKey` (`lib/bao-mat/api-keys.ts`) — báo sai: key `xbk_` là 256 bit ngẫu nhiên, SHA-256 là đúng (KDF chậm chỉ cho mật khẩu người dùng); nếu còn đỏ cần chủ repo dismiss "False positive" ở Security → Code scanning.
- A2-AC10 lớp B đã merge ở #668 `6690593`.

## Tiếp theo

- **Deploy to VPS đỏ** (run 39764210485, 39789754927): `VPS_SSH_KNOWN_HOSTS` được khai ở Actions → Variables nhưng workflow chỉ đọc `secrets.*` nên nhận rỗng và dừng fail-closed. Sửa: `deploy.yml` đọc `secrets.VPS_SSH_KNOWN_HOSTS || vars.VPS_SSH_KNOWN_HOSTS` (host key là dữ liệu công khai), vẫn dừng khi cả hai rỗng/không khớp `VPS_HOST`; test hồi quy `tests/deploy-known-hosts.test.ts` (đỏ trước sửa). Sau merge cần xem run deploy kế tiếp qua bước SSH.
- **npm audit đỏ** (static, PR #670, 22/10): advisory critical mới cho `next` 16.0.0–16.4.0 (GHSA-2464-fhr4-w9xw, GHSA-p3m5-59mp-jv5r, GHSA-673q-mjm6-r5xr). Nâng `next` + `eslint-config-next` 16.3.8 → 16.4.2; `npm audit --omit=dev --audit-level=high` xanh. Còn 5 high chỉ ở chuỗi dev `eslint-config-next`→`braces` (CI chỉ chặn critical cho dev).
- A2 còn mở: Safari/iOS thiết bị thật (cần người); ảnh mồ côi giữ P/H S06.
- Chọn lát S15 tiếp theo hoặc audit 1152 MUST/639 SHOULD.

## Quyết định

D-A2-001 tự duyệt lát B theo QUALITY-FINAL-1 Approved 25/09/2026. D-A2-002 (mức S): vá `OfflineQueueBadge` không mount lại màn phục hồi khi hàng đợi về 0 (RED trước vá ở `.autopilot/runtime/a2-run4.log`). #663 `2adda49d`, #664 `8fc15d89`, #665 `9c13f54a`, #666 `273a09d`, #668 `6690593` đã merge. A2/S15 giữ PARTIAL tổng thể.

## Bàn giao phiên

Mốc main: `6690593`. Loop một phiên (`docs/autopilot/A2-AC10-PLAN.md`), bằng chứng `.autopilot/evidence/T-00x.json`. Node 24 cục bộ qua `/root/.local/bin/node` (khớp CI; không sửa /opt/node22). Toàn 1152 MUST/639 SHOULD chưa audit; M/O/production/release giữ trạng thái cũ.
