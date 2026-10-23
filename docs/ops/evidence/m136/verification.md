# M136 — Bằng chứng triển khai ngày 23/10/2026

Đã triển khai các slice A–D theo đặc tả M136 được chủ dự án duyệt. Mã nguồn đang ở
worktree `codex/upgrade-ux-performance`, base `efd31ba0`. Chủ dự án đã duyệt commit, push và
deploy sau khi xem bằng chứng này; phát hành qua PR/CI, chưa xác nhận production tại checkpoint này.
Checkout gốc có 1.508 tệp xóa từ trước được giữ nguyên.

## Thay đổi đã kiểm chứng

- Form tracking giữ input khi mất mạng/HTTP lỗi, nhả pending và cho thử lại; chặn gửi lặp.
- Đổi thứ tự sheet có phản hồi và rollback; lý do trễ chỉ đổi khi server xác nhận.
- Nhóm tracking mở/thu bằng bàn phím; giữ tay nắm kéo M135. Thanh tiêu đề mobile có hai
  hàng; nút sửa 44×44px, không tràn ngang ở 360/393px; thanh lọc/tab neo dưới header.
- Search dùng một dialog trên mọi trang, trả focus, hỗ trợ bàn phím/lỗi/thử lại; menu thường
  dùng và kết quả tuân quyền, cờ module, cấu hình hiển thị. Bỏ copy Voice/Zalo/Swarm/IoT/AI
  Vision lỗi thời và các lệnh quảng bá tĩnh không phù hợp.
- Chuông dừng poll khi tab ẩn, hủy kết quả cũ và không chồng request. CLI kiểm kê dùng kết
  nối riêng, transaction chỉ đọc, scope rõ, phân biệt `unknown` với số 0.
- Dashboard tái sử dụng KPI/lịch sử và bỏ tính ngân sách không dùng. Dữ liệu chính hiển thị
  độc lập; từng nguồn phụ có trạng thái riêng và chỉ thử lại nguồn lỗi.

## Cổng và kiểm thử

| Kiểm tra                                          | Kết quả                                                                                                                 |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `npm run gate`                                    | PASS 18/18: format, lint, TypeScript, màu/contrast/UI, SW, layers, dead code/routes, scope/quyền/tham số DB và PROGRESS |
| `npm run build`                                   | PASS production build                                                                                                   |
| Bốn file unit `tests/upgrade-*` không DB          | PASS 25/25, không skip                                                                                                  |
| `tests/upgrade-ops-inventory-db.test.ts`          | PASS 4/4 trên PostgreSQL thật, không skip; READ ONLY, org/project, savepoint, RLS                                       |
| Bốn file browser `e2e/authed/upgrade-*`           | PASS 45/45 gồm setup; desktop và Pixel 5, không skip                                                                    |
| Viewport/focus trên bản build cuối                | PASS 360/393/1280px; nút sửa đủ 44px, không tràn ngang, viền focus nằm trong vùng chạm                                  |
| Full `npm test -- --release-gate`                 | PASS, exit 0: 383 file, 5.152 ca pass, 0 fail, 1 skip được allowlist                                                    |
| E2E hồi quy shell/dashboard/role/tracking/offline | PASS 62, skip 1 theo platform có sẵn; gồm setup và chạy lại field trên build cuối                                       |
| Cỡ chữ nhập liệu mobile                           | PASS 29/29 gồm setup, không skip                                                                                        |
| Kéo thả M135 desktop                              | PASS 2/2 gồm setup, không skip                                                                                          |

Các kiểm thử mới mô phỏng lỗi bằng route abort/HTTP 403/500/503 thật trong browser. Route
mocks chặn service worker để không nhận nhầm response từ cache. Lỗi logic được tái hiện
RED trước vá; không hạ threshold hay bỏ quy tắc axe. Axe chờ transition opacity của nút
kết thúc trước khi đo tương phản. Ca skip hồi quy có sẵn là kiểm nút thu gọn sidebar desktop
trong project mobile (mobile dùng drawer); không thêm skip để làm xanh đợt nâng cấp này.

Lượt full test đầu chạy trên tài khoản DB test thông thường làm hai file recovery không
thỏa điều kiện CI; đã xác định và chạy riêng thành công 24+3 ca trên PostgreSQL 16 disposable
đúng marker/server IP/user/client. Lượt full cuối dùng cùng môi trường đúng này, không sửa
test hoặc nới guard để vượt cổng. Ca skip duy nhất của release gate là tình huống health
không có DB, không dựng được trong lượt tích hợp có DB; đúng allowlist hiện hữu.

## Đo trước–sau trên cùng fixture

Nguồn nguyên bản: [baseline.json](baseline.json), [candidate.json](candidate.json).
Baseline là production build `efd31ba0`; candidate là base đó cộng diff M136. Project test có
5 sheet, 34 nhóm, 160 task, 552 dimension. Đã dọn đúng fixture timeout trước đo; các dự án test
khác không nằm trong scope. Kích thước và SHA-256 response của cả ba API khớp tuyệt đối.

Node 24.21.0, Chromium 153.0.8010.12, PostgreSQL 16, server loopback. Mỗi API warmup rồi
25 request, concurrency 5. Mỗi trang có 5 context mới, Pixel 5 393×851, latency 150ms,
download 200.000 byte/s, upload 93.750 byte/s, CPU chậm 4 lần, service worker bị chặn.
Không chạy build/test nặng đồng thời với phép đo. Hai bản dùng cùng cấu hình benchmark,
không bật vault bằng cờ E2E; kiểm thử vault chạy riêng với `XBOSS_E2E=1`.

| API                         | p50 trước → sau   | p95 trước → sau   | Thay đổi p95 |
| --------------------------- | ----------------- | ----------------- | ------------ |
| `/api/dashboard`            | 191,82 → 157,01ms | 329,60 → 232,49ms | −29,46%      |
| `/api/dashboard?range=week` | 186,27 → 119,95ms | 259,20 → 129,31ms | −50,11%      |
| `/api/tasks?sheet=ogtd`     | 81,40 → 62,78ms   | 97,38 → 76,15ms   | −21,80%      |

Endpoint tasks là đối chứng: không đổi code route này trong M136. Số đo của nó cho thấy lab
cũng có biến động môi trường/cache; không quy toàn bộ chênh lệch latency cho thay đổi code.
Test call-count riêng chứng minh dashboard không còn tính báo cáo ngân sách và KPI/lịch sử
lặp trong cùng request.

| Mobile, trung vị 5 lượt                                | Trước   | Sau     |
| ------------------------------------------------------ | ------- | ------- |
| Trang chủ: dữ liệu chính sẵn sàng                      | 4.105ms | 4.107ms |
| Tracking: sẵn sàng                                     | 3.553ms | 3.435ms |
| Trang chủ: LCP snapshot                                | 3.888ms | 3.884ms |
| Tracking: LCP snapshot                                 | 3.404ms | 3.284ms |
| Trang chủ: CLS snapshot                                | 0,02154 | 0,00279 |
| Tracking: CLS snapshot                                 | 0,00598 | 0,00512 |
| Trang chủ: request / API request                       | 42 / 17 | 42 / 17 |
| Tracking: request / API request                        | 27 / 13 | 27 / 13 |
| Trang chủ: response body byte đã hoàn tất tại snapshot | 392.591 | 394.789 |
| Tracking: response body byte đã hoàn tất tại snapshot  | 365.399 | 366.361 |

Trang chủ chưa cải thiện đáng kể thời gian mở; payload đầu trang tăng nhẹ khoảng 0,56%.
Đợt này không giảm số request ban đầu; giới hạn poll có tác dụng khi tab ẩn/request chậm.
Không dùng snapshot nhỏ này để tuyên bố đạt Core Web Vitals hoặc INP người dùng thật. Chưa
chạy bậc tải 20/50 phiên. Ưu tiên tiếp theo là profile JS/hydration và đo pilot thực tế.

## Hình ảnh và phần chưa nghiệm thu

- [Dashboard desktop](dashboard-desktop.png), [tracking mobile 360px](tracking-mobile.png),
  [search mobile](search-mobile.png).
- [Hình học responsive đo từ browser](responsive.json).

Chưa có UAT 3–5 người, Safari/iOS/cảm ứng trên thiết bị thật, cửa sổ usage phù hợp và rollout
production. Chưa xóa capability/schema/dữ liệu nghiệp vụ sống: chỉ gỡ nội dung sai và tinh gọn
điều hướng. Dùng runbook `docs/ops/upgrade-ux-performance.md` để hoàn tất các bước vận hành;
không đánh dấu toàn goal Complete từ kết quả kỹ thuật này.
