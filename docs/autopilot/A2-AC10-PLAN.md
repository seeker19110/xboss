# Autopilot — A2-AC10 · 22/10/2026

> Duyệt bởi phiên chính: D-A2-001 (phạm vi lát B), QUALITY-FINAL-1 Approved 25/09/2026 bởi chủ dự án XBoss.
> Base: `273a09d` (main sau #666), không còn PR mở của autopilot trước khi bắt đầu.

## Phạm vi và cổng duyệt

S15 ghi A2-AC10 PARTIAL, còn thiếu "B diary conflict thật". Lát này thêm một spec Playwright
`e2e/authed/a2-ac10-diary-conflict.spec.ts` (Chromium desktop/mobile, IDB/SW/HTTP/DB thật) cho
ba luồng: If-Match cũ → 412 + giải quyết "giữ bản thiết bị"; tạo-nếu-chưa-có → 412 + "dùng bản
máy chủ"; mất ACK → replay receipt không 412 giả. Không sửa route/schema/quyền/CI/hook.

D-A2-002 (tự duyệt, mức S): spec bắt được lỗi UI thật — `OfflineQueueBadge` trả `panel` trần khi
hàng đợi về 0 nên React mount lại màn phục hồi đang mở, mất thông báo "Đã bỏ bản trên thiết bị…"
và focus. Sửa một dòng giữ panel cùng vị trí cây; RED trước vá ở `.autopilot/runtime/a2-run4.log`.
Acceptance riêng: [A2-AC10-ACCEPTANCE](A2-AC10-ACCEPTANCE.md). Ảnh mồ côi giữ P/H S06; M Safari/iOS
vẫn NOT_RUN. PR theo `merge_autonomy: L1` — gom cho người merge.

## Ngân sách (4 con số)

- Số vòng tối đa: 20.
- Ngân sách: 50000 token kể từ `loop init`; không provider trả phí.
- Timeout mỗi lệnh Gate: 3600 giây.
- Hạn chót: 4 giờ từ `loop init`.

## Điểm dừng bắt buộc về hành động

- Production, dữ liệu thật, secret, tiền thật, thông báo đối ngoại — ngoài lát.
- Sửa quyền, CI/hook bảo vệ — không làm.
- Merge PR theo L1: làm xong, review, CI xanh rồi gom cho người.
- Cùng chữ ký lỗi ba lần: blocked; lần hai phải đổi cách.

## Task

- [x] `T-001` Spec A2-AC10 compile — Gate: `npm run typecheck`
- [x] `T-002` Build production — Gate: `npm run build`
- [x] `T-003` B desktop/mobile 6 ca + setup — Gate: `bash -o pipefail -c "npm run test:e2e -- e2e/authed/a2-ac10-diary-conflict.spec.ts --workers=2 --output=.autopilot/runtime/a2-browser 2>&1 | tee .autopilot/runtime/a2-browser.log"`
- [x] `T-004` Lặp ba lần mỗi viewport — Gate: `bash -o pipefail -c "npm run test:e2e -- e2e/authed/a2-ac10-diary-conflict.spec.ts --repeat-each=3 --workers=2 --output=.autopilot/runtime/a2-repeat 2>&1 | tee .autopilot/runtime/a2-repeat.log"`
- [x] `T-005` Cổng tĩnh — Gate: `npm run gate`
- [x] `T-006` Acceptance đủ bằng chứng — Gate: `python3 .xtemplates/scripts/xt.py blueprint-status docs/autopilot/A2-AC10-ACCEPTANCE.md --strict`

## Contract và file ownership

Chỉ tạo spec mới, vá `app/components/OfflineQueueBadge.tsx` (D-A2-002) và tài liệu autopilot/S15/PROGRESS. Fixture dùng `dungToChucCoLap(["pm","engineer"])`
(org riêng mỗi ca) nên song song desktop/mobile không giẫm ngày nhật ký. "Người khác" là kỹ sư ở
browser context riêng, PUT qua fetch trong trang đã đăng nhập (cookie thật). Observer chỉ đọc header
request/response; riêng ca mất ACK dùng `route.fetch()` rồi `abort`/`fulfill` (cùng kỹ thuật
offline-deep A2-AC08), không sửa body/status server trả.
