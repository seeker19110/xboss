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

Build production `d902a54570f03dcc6f0c537804e08b235e4d1eca`, ID `Y07byBUqBBE6tY_yxkSpi`:

- 84 ca hành vi mới (42 × desktop/mobile) + setup = **85 pass/0 fail/0 flaky/0 skip**, retries=0.
- Gate cuối **18/18**; build và full local unit **385 file/5.165 pass/0 fail/1 skip** health
  đúng allowlist (ca no-DB degraded không dựng được khi có DB), không coi skip là pass.
- Full npm audit gồm dev **0 vulnerability**; không thay lock/dependency.
- Root review toàn diff; review chéo floor/tech/diary/Bell/text không có P1/P2 mới trong phạm vi.
- Hồi quy liên quan **121 pass/0 fail/0 flaky/0 skip**, retries=0, gồm setup + 120 lượt hành vi desktop/mobile: nhật ký offline/xung đột/receipt, ma trận/chi tiết tầng, thông báo/poll visibility, nhãn/modal, tech, báo cáo/lookahead/gantt/timeline. Tổng hai lượt browser 206 pass (hai setup), không gộp thành 206 hành vi mới. CI/merge/deploy chưa được coi là hoàn tất.

[checks.json](checks.json) ghi checkpoint local, tách kết quả CI sau này. Trong verification có sửa
fixture: scope alert trong main để tránh Next route announcer; đợi GET retry thật hoàn tất;
chọn explicit Light/Dark Blue và chờ transition hữu hạn kết thúc trước axe. Không tắt rule,
giảm threshold/timeout hoặc thêm skip. Axe thật phát hiện và đã sửa label nhật ký, tương phản
cảnh báo gallery/timestamp thông báo và dòng kế hoạch. Mọi assertion nghiệp vụ cũ giữ nguyên.

## Hiệu năng có giới hạn

[floor-before.json](floor-before.json) đo primary response → công tác đầu sẵn sàng trên cùng
fixture hai công tác, auth disposable thật. Chromium 153.0.8010.12/Node 24.22.1,
5 cặp alternating 0/3000ms suppliers cho mỗi desktop1280×720 và Pixel5.
Baseline median bình thường 40,0/41,1ms; suppliers trễ 3s là 3031,6/3026,1ms.
[Sau sửa](floor-after.json), chạy riêng sau khi unit/gate/E2E hoàn tất: median bình thường
**59,7/56,1ms**, suppliers trễ 3s **60,1/53,4ms** (desktop/mobile). Mẫu bình thường tăng khoảng
15–20ms, không khẳng định cải thiện latency ở trường hợp đó. Lợi ích được chứng minh là công tác
không còn phải chờ suppliers. N=5 cặp/profile, hash script và hai fixture giống trước/sau,
20 response primary đều 200, không pageerror.

[Lượt candidate chạy đồng thời](floor-after-concurrent.json) với gate/axe cho normal164,5/76,6ms,
slow109,5/66,9ms; giữ riêng để không che nhiễu máy. Chạy lại khi máy rảnh để phân biệt chi phí
render với cạnh tranh CPU. Không gọi đây là tốc độ trang production/Core Web Vitals, không dùng
mẫu nhỏ để hứa p75/p95 thực địa và không đặt timing threshold CI.

Chạy lại [script nguyên bản](floor-benchmark.cjs.txt) (hash trong raw), override đường dẫn theo máy:

```bash
cp docs/ops/evidence/ui-recovery-2026-10/floor-benchmark.cjs.txt /tmp/xboss-floor-benchmark.cjs
BENCH_WORKTREE="$PWD" BASE_URL=http://127.0.0.1:3148 \
  BENCH_SOURCE_SHA="$(git rev-parse HEAD)" BENCH_LABEL=candidate \
  node /tmp/xboss-floor-benchmark.cjs
```

Server phải là build tương ứng, auth file `playwright/.auth/admin.json` của DB test disposable.
[Bài thử request-count trước](report-requests-before.json) và [sau](report-requests-after.json):
5 lựa chọn system/range vẫn 5 primary GET; forecast **5→1**, danh mục hệ **4→1**.
Bản đo report `3c48755d` có content hai file report/SystemFilter giống bản cuối `d902a545`.
Forecast unfiltered giữ nguyên contract API; không suy diễn số request thành giảm latency server.
[Script gốc](report-request-benchmark.cjs.txt) dùng cùng baseURL3148/DB test:

```bash
cp docs/ops/evidence/ui-recovery-2026-10/report-request-benchmark.cjs.txt .autopilot/report-request-benchmark.cjs
REPORT_BENCH_LABEL=candidate REPORT_BENCH_SOURCE="$(git rev-parse HEAD)" \
  REPORT_BENCH_OUTPUT=/tmp/report-requests.json node .autopilot/report-request-benchmark.cjs
```

## Kiểm tra hình thức

Đã xem trực tiếp ảnh mobile393×727 bản cuối với dữ liệu test:
[gallery Light](gallery-light.png), [gallery Dark Blue](gallery-darkblue.png),
[kế hoạch lỗi](lookahead-light.png). Draft/trạng thái lỗi đọc được, không tràn body;
Retry/Đóng/select mới 44px, select/input form chính16px. [Metrics](visual.json) ghi nguồn.
Axe kiểm error/loading/empty/success và hai theme như ca test áp dụng, không thay UAT thiết bị thật.

## Production và giới hạn

[Public smoke trước sửa](production-before.json) 04:09:40Z đạt desktop/mobile login,
asset/axe/health/readiness; endpoint bảo vệ trả 401. Chỉ đọc, không đăng nhập/ghi production.
Các trang sau auth và tình huống lỗi được kiểm trên build production cục bộ với DB test.
UAT 3–5 người, Safari/cảm ứng thật và usage tiếp tục WAITING theo owner. Runtime VPS
mới xác nhận Node major24 từ release trước, patch version chưa có bằng chứng.
Rollout dùng pipeline hiện hữu, không migration; rollback bằng revert commit release và pipeline cũ.

Đây là checkpoint CODE VERIFIED trước merge. Kết quả CI/merge SHA/deploy/public smoke cuối sẽ nằm ở mục **Kết quả phát hành** của PR bản phục hồi UI; không coi checkpoint local là production.
