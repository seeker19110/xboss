# Phục hồi UI và tải chính độc lập — 24/10/2026

Baseline source: `6a6bc0bd32a4efc652d2f31e979e1e9ba57bbe37` (#679). Owner yêu cầu tiếp tục
rà production và tự triển khai, ưu tiên chất lượng, đơn giản hóa; UAT/usage giữ WAITING.
Áp dụng `.agents/skills/ui-ux-craftsman/SKILL.md` và design-system master.

## Vấn đề và phạm vi

- Chi tiết mặt bằng: Promise.all chờ suppliers mới hiện công tác; PUT mất mạng kẹt busy;
  refresh công tác khác ghi đè draft; tài liệu loading/error hiển thị như chưa có file.
- Chuông thông báo: tải đầu/lỗi thành empty; mark-all thiếu guard/catch/status check.
  Nhãn giao diện cache GET thất bại như một lần tải thành công, không phục hồi khi mở lại.
- Ảnh/album: GET lỗi thành rỗng; upload đã nhận nhưng GET refresh thất bại làm mất ảnh đang xem;
  album pending vẫn sửa/đóng/gửi trùng. Nhật ký cho phép lock/unlock/đóng/sửa khi đang lưu.
- Kế hoạch/báo cáo: response cũ thay dữ liệu bộ lọc mới, thiếu retry, cho in lúc chưa tải;
  link `days=7` vẫn mở 14 ngày; forecast cùng endpoint tải lại theo mọi bộ lọc.

Chỉ sửa client của capability hiện có. API/payload/schema/auth/role/project scope,
If-Match/If-None-Match và 412 của nhật ký, hàng đợi mã hóa offline, export/PDF và quyền khóa
sổ giữ nguyên. Không dependency, telemetry hoặc module mới; không xóa capability.

## RED trước sửa

[red.json](red.json) ghi bốn lượt browser trên baseline app, 17 failure đúng các hành vi trên;
2 pass, 4 chưa chạy do `--max-failures=8` ở lượt đầu (không thêm skip vào test).
Build baseline `b76fcc44` có app/lib/package/lock content giống `6a6bc0bd`, đã kiểm bằng git diff.
Mọi route lỗi/mutation trong ca mới dùng fixture, auth đọc từ PostgreSQL disposable;
không production DB/secret. RED gồm giữ suppliers, GET 500/abort, cache lỗi,
PUT/lock pending, phản hồi 14 ngày/lỗi kỳ cũ đến muộn và link 7 ngày sai.

## Kiểm chứng kỹ thuật

Checkpoint đang VERIFYING; chưa coi build local là phát hành. Kết quả GREEN, gate/build/unit,
regression, benchmark sau sửa và hình thức sẽ được bổ sung sau khi chạy trên bản tích hợp.

## Hiệu năng có giới hạn

[floor-before.json](floor-before.json) đo primary response → công tác đầu sẵn sàng trên cùng
fixture hai công tác, auth disposable thật. Chromium 153.0.8010.12/Node 24.22.1,
5 cặp alternating 0/3000ms suppliers cho mỗi desktop1280×720 và Pixel5.
Baseline median bình thường 40,0/41,1ms; suppliers trễ 3s là 3031,6/3026,1ms.
Không gọi đây là tốc độ trang production/Core Web Vitals. Không đặt timing threshold CI.

Chạy lại [script nguyên bản](floor-benchmark.cjs.txt) (hash trong raw), override đường dẫn theo máy:

```bash
cp docs/ops/evidence/ui-recovery-2026-10/floor-benchmark.cjs.txt /tmp/xboss-floor-benchmark.cjs
BENCH_WORKTREE="$PWD" BASE_URL=http://127.0.0.1:3148 \
  BENCH_SOURCE_SHA="$(git rev-parse HEAD)" BENCH_LABEL=candidate \
  node /tmp/xboss-floor-benchmark.cjs
```

Server phải là build tương ứng, auth file `playwright/.auth/admin.json` của DB test disposable.
Forecast unfiltered giữ nguyên contract API; kiểm request-count riêng khi đổi kỳ/hệ,
không suy diễn thành giảm latency server.

## Production và giới hạn

[Public smoke trước sửa](production-before.json) 04:09:40Z đạt desktop/mobile login,
asset/axe/health/readiness; endpoint bảo vệ trả 401. Chỉ đọc, không đăng nhập/ghi production.
Các trang sau auth và tình huống lỗi được kiểm trên build production cục bộ với DB test.
UAT 3–5 người, Safari/cảm ứng thật và usage tiếp tục WAITING theo owner. Runtime VPS
mới xác nhận Node major24 từ release trước, patch version chưa có bằng chứng.
Rollout dùng pipeline hiện hữu, không migration; rollback bằng revert commit release và pipeline cũ.
